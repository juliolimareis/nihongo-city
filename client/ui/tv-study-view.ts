import type { SubtitleCueDto, TvLibraryDto, TvPartDto, TvTranscriptDto, TvVideoDetailDto } from '../../shared/contracts';
import type { AudioPort, GameApi, SubtitleMode, TvPrefsStore } from '../application/ports';
import type { Store } from '../application/store';
import { activeCue, formatClock } from '../domain/subtitles';
import { $, esc, html } from './dom';
import type { Modal } from './modal';

export interface TvStudyViewDeps {
  store: Store;
  api: GameApi;
  audio: AudioPort;
  modal: Modal;
  prefs: TvPrefsStore;
  /** Chamado quando a mídia começa ou para de tocar em segundo plano (modal fechado). */
  onBackgroundChange?: (playing: boolean) => void;
}

type Mode = 'radio' | 'tv';
type Lang = 'ja' | 'pt';

const LANG_LABEL: Record<Lang, string> = { ja: '日本語', pt: 'PT-BR' };
const NO_TRANSCRIPT: TvTranscriptDto = { ja: [], pt: [] };

/** "Estudar com TV": trechos de vídeos do YouTube para ouvir (rádio) ou assistir (TV), com legenda e texto. */
export class TvStudyView {
  private root: HTMLElement | null = null;
  private library: TvLibraryDto = { videos: [], lastVideoId: null };
  private video: TvVideoDetailDto | null = null;
  private part = 1;
  private mode: Mode = 'radio';
  private media: HTMLMediaElement | null = null;
  private cues: TvTranscriptDto = NO_TRANSCRIPT;
  private textLang: Lang = 'ja';
  private readonly transcripts = new Map<string, Promise<TvTranscriptDto>>();

  constructor(private readonly deps: TvStudyViewDeps) {}

  async open(): Promise<void> {
    const { store, api, audio, modal } = this.deps;
    const root = html('<div class="tvs"><p class="tvs__lead">Carregando…</p></div>');
    // onDetach e não onClose: a mídia tem de sair do modal antes de o conteúdo ser removido,
    // inclusive quando outro modal (baralho, estudo…) toma o lugar deste.
    modal.open('📺 Estudar com TV', root, { onDetach: () => this.detach() });
    this.root = root;

    // Um trecho ficou tocando (ou pausado) em segundo plano: volta direto ao player, sem recarregar.
    if (this.video && this.media) {
      this.deps.onBackgroundChange?.(false);
      audio.stopVoice();
      audio.suspendMusic(true);
      this.renderPlayer();
      this.renderPart();
      this.placeMedia(this.media);
      this.loadText();
      return;
    }

    try {
      this.library = await api.tvLibrary(store.player.id);
    } catch (err) {
      if (this.root === root) root.replaceChildren(html(`<p class="tvs__lead">Erro: ${esc((err as Error).message)}</p>`));
      return;
    }
    if (this.root === root) this.renderHome();
  }

  /** O modal vai sumir: o trecho segue em segundo plano e o player reaparece igual ao reabrir. */
  private detach(): void {
    this.root = null;
    const media = this.media;
    if (!media) {
      this.video = null;
      this.deps.audio.suspendMusic(false);
      return;
    }
    // Um <video> removido da página é pausado pelo navegador; movido na mesma tarefa, não.
    if (media instanceof HTMLVideoElement) this.parking().append(media);
    if (media.paused) this.deps.audio.suspendMusic(false);
    else this.deps.onBackgroundChange?.(true);
  }

  private parking(): HTMLElement {
    let host = document.getElementById('tvs-parking');
    if (!host) {
      host = html('<div id="tvs-parking" hidden></div>');
      document.body.append(host);
    }
    return host;
  }

  // ===== Menu: rádio ou TV =====

  private renderHome(): void {
    const root = this.root;
    if (!root) return;
    this.stopMedia();
    this.deps.audio.suspendMusic(false);
    const { videos, lastVideoId } = this.library;
    if (!videos.length) {
      root.replaceChildren(html(`
        <div class="tvs__empty">
          <strong>Nenhum vídeo por aqui ainda.</strong>
          <p>Adicione um vídeo do YouTube pelo terminal e ele aparece nesta lista:</p>
          <code>python scripts/add_video.py https://www.youtube.com/watch?v=…</code>
        </div>`));
      return;
    }
    const current = videos.find((v) => v.id === lastVideoId) || videos[0];
    const home = html(`
      <div class="tvs__home">
        <p class="tvs__lead">Ouça ou assista a trechos curtos de vídeos reais em japonês. Como você quer estudar?</p>
        <div class="tvs__choices">
          <button type="button" class="tvs-choice" data-mode="radio" autofocus>
            <img src="/img/objects/radio.png" alt="">
            <strong>📻 Rádio</strong><small>Só o áudio</small>
          </button>
          <button type="button" class="tvs-choice" data-mode="tv">
            <img src="/img/objects/tv.png" alt="">
            <strong>📺 TV</strong><small>Vídeo com legenda</small>
          </button>
        </div>
        <p class="tvs__resume">${lastVideoId ? 'Continuar' : 'Começar por'}:
          <strong class="jp">${esc(current.title)}</strong> — parte ${current.part} de ${current.parts}</p>
      </div>`);
    home.querySelectorAll<HTMLElement>('[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => { void this.openPlayer(btn.dataset.mode as Mode, current.id); });
    });
    root.replaceChildren(home);
  }

  // ===== Player =====

  private async openPlayer(mode: Mode, videoId: string): Promise<void> {
    const root = this.root;
    if (!root) return;
    const { store, api, audio } = this.deps;
    this.stopMedia();
    let video: TvVideoDetailDto;
    try {
      video = await api.tvVideo(store.player.id, videoId);
    } catch (err) {
      if (this.root === root) root.replaceChildren(html(`<p class="tvs__lead">Erro: ${esc((err as Error).message)}</p>`));
      return;
    }
    if (this.root !== root) return;
    this.video = video;
    this.part = video.part;
    this.mode = mode;
    audio.stopVoice();
    audio.suspendMusic(true);
    this.renderPlayer();
    this.showPart(0);
  }

  private renderPlayer(): void {
    const root = this.root;
    if (!root) return;
    const content = html(`
      <div class="tvs__player">
        <div class="tvs__main">
          <div class="tvs__stage"></div>
          <div class="tvs__panel">
            <h3 class="tvs__title jp"></h3>
            <p class="tvs__part"></p>
            <div class="tvs__time">
              <input type="range" class="tvs__seek" min="0" max="0" step="1" value="0" aria-label="Posição no trecho">
              <span class="tvs__clock">0:00 / 0:00</span>
            </div>
            <div class="tvs__controls">
              <button type="button" class="btn" data-prev>⏮ Anterior</button>
              <button type="button" class="btn btn--primary" data-toggle autofocus>⏸ Pausar</button>
              <button type="button" class="btn" data-next>Próximo ⏭</button>
            </div>
            <div class="tvs__actions">
              <button type="button" class="btn btn--small" data-switch></button>
              <button type="button" class="btn btn--small" data-text>📄 Texto</button>
              <label class="tvs__subs-pick">Legenda
                <select data-subs>
                  <option value="off">Desligada</option>
                  <option value="ja">日本語</option>
                  <option value="pt">PT-BR</option>
                </select>
              </label>
              <button type="button" class="btn btn--small btn--ghost" data-home>↩ Menu</button>
            </div>
            <p class="tvs__hint">🔁 O trecho repete até você tocar em “Próximo”.</p>
            <ul class="tvs__list" aria-label="Vídeos disponíveis"></ul>
          </div>
        </div>
        <div class="tvs-text" hidden>
          <div class="tvs-text__bar">
            <strong class="tvs-text__title jp"></strong>
            <span class="tvs-text__buttons">
              <button type="button" class="btn btn--small" data-lang="ja">日本語</button>
              <button type="button" class="btn btn--small" data-lang="pt">PT-BR</button>
              <button type="button" class="btn btn--small" data-print>🖨 Imprimir</button>
              <button type="button" class="btn btn--small" data-text-close>✕ Fechar texto</button>
            </span>
          </div>
          <div class="tvs-text__body jp" tabindex="0"></div>
        </div>
      </div>`);

    $('[data-prev]', content).addEventListener('click', () => this.goToPart(this.part - 1));
    $('[data-next]', content).addEventListener('click', () => this.goToPart(this.part + 1));
    $('[data-toggle]', content).addEventListener('click', () => {
      const media = this.media;
      if (!media) return;
      if (media.paused) media.play().catch(() => {}); else media.pause();
    });
    $('[data-switch]', content).addEventListener('click', () => {
      const at = this.media ? this.media.currentTime : 0;
      this.mode = this.mode === 'radio' ? 'tv' : 'radio';
      this.showPart(at);
    });
    $('[data-home]', content).addEventListener('click', () => this.renderHome());
    $<HTMLInputElement>('.tvs__seek', content).addEventListener('input', (e) => {
      if (this.media) this.media.currentTime = Number((e.target as HTMLInputElement).value);
    });

    const subs = $<HTMLSelectElement>('[data-subs]', content);
    subs.value = this.deps.prefs.subtitles();
    subs.addEventListener('change', () => {
      this.deps.prefs.setSubtitles(subs.value as SubtitleMode);
      this.renderSubtitle();
    });

    $('.tvs__list', content).addEventListener('click', (e) => {
      const id = (e.target as Element).closest<HTMLElement>('[data-id]')?.dataset.id;
      if (id && id !== this.video?.id) void this.openPlayer(this.mode, id);
    });

    $('[data-text]', content).addEventListener('click', () => this.toggleText(true));
    $('[data-text-close]', content).addEventListener('click', () => this.toggleText(false));
    $('[data-print]', content).addEventListener('click', () => this.print());
    content.querySelectorAll<HTMLElement>('[data-lang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.textLang = btn.dataset.lang as Lang;
        this.renderText();
      });
    });

    root.replaceChildren(content);
    $('[data-toggle]', content).focus();
  }

  private currentPart(): TvPartDto | null {
    const video = this.video;
    if (!video) return null;
    return video.partList.find((p) => p.index === this.part) || video.partList[0] || null;
  }

  private goToPart(part: number): void {
    const video = this.video;
    if (!video || part < 1 || part > video.parts) return;
    this.part = part;
    this.showPart(0);
  }

  /** Monta o rádio ou a TV com a parte atual, começando em `startAt` segundos, e salva o progresso. */
  private showPart(startAt: number): void {
    const video = this.video;
    const part = this.currentPart();
    if (!this.root || !video || !part) return;
    this.renderPart();
    this.mountMedia(part, startAt);
    this.saveProgress(video.id, part.index);
    this.loadText();
  }

  /** Título, parte, botões e lista do player conforme o vídeo, a parte e o modo atuais. */
  private renderPart(): void {
    const root = this.root;
    const video = this.video;
    const part = this.currentPart();
    if (!root || !video || !part) return;
    const radio = this.mode === 'radio';
    $('.tvs__title', root).textContent = video.title;
    $('.tvs__part', root).textContent = `${radio ? '📻' : '📺'} Parte ${part.index} de ${video.parts}`;
    $<HTMLButtonElement>('[data-prev]', root).disabled = part.index <= 1;
    $<HTMLButtonElement>('[data-next]', root).disabled = part.index >= video.parts;
    $('[data-switch]', root).textContent = radio ? '📺 TV' : '📻 Rádio';
    $('.tvs__subs-pick', root).hidden = radio;
    $('.tvs__hint', root).textContent = '🔁 O trecho repete até você tocar em “Próximo”.';
    this.renderList();
  }

  private loadText(): void {
    const video = this.video;
    const part = this.part;
    if (!video) return;
    this.cues = NO_TRANSCRIPT;
    this.renderText();
    void this.transcript(video.id, part).then((cues) => {
      if (this.video !== video || this.part !== part) return;
      this.cues = cues;
      this.renderText();
      this.renderSubtitle();
    });
  }

  /** Desenha o rádio ou a TV no palco em volta da mídia (nova ou a que já vinha tocando). */
  private placeMedia(media: HTMLMediaElement): void {
    const root = this.root;
    if (!root) return;
    const stage = $('.tvs__stage', root);
    if (media instanceof HTMLVideoElement) {
      const tv = html(`
        <div class="tvs-tv">
          <img class="tvs-tv__frame" src="/img/objects/tv.png" alt="">
          <div class="tvs-tv__screen">
            <p class="tvs-tv__subs jp" hidden></p>
          </div>
        </div>`);
      stage.replaceChildren(tv);
      // Só depois de a TV estar na página: assim o vídeo que vem do segundo plano nunca fica fora dela.
      $('.tvs-tv__screen', tv).prepend(media);
    } else {
      // O <audio> nunca entra na página, então fechar o modal não o pausa.
      stage.replaceChildren(html('<div class="tvs-radio"><img src="/img/objects/radio.png" alt="Rádio"></div>'));
    }
    this.onPlayState(media);
    this.onTime(media);
  }

  private mountMedia(part: TvPartDto, startAt: number): void {
    if (!this.root) return;
    this.stopMedia();
    const media: HTMLMediaElement = document.createElement(this.mode === 'radio' ? 'audio' : 'video');
    if (media instanceof HTMLVideoElement) media.setAttribute('playsinline', '');
    media.loop = true;
    media.preload = 'auto';
    media.src = this.mode === 'radio' ? part.audio : part.video;
    if (startAt > 0) {
      media.addEventListener('loadedmetadata', () => {
        media.currentTime = Math.min(startAt, Math.max(0, media.duration - 1));
      }, { once: true });
    }
    media.addEventListener('timeupdate', () => this.onTime(media));
    media.addEventListener('durationchange', () => this.onTime(media));
    media.addEventListener('play', () => this.onPlayState(media));
    media.addEventListener('pause', () => this.onPlayState(media));
    media.addEventListener('error', () => {
      if (this.media === media && this.root) $('.tvs__hint', this.root).textContent = '⚠️ Não foi possível carregar este trecho.';
    });
    this.media = media;
    this.placeMedia(media);
    media.play().catch(() => {});
  }

  private stopMedia(): void {
    const media = this.media;
    if (!media) return;
    this.media = null;
    media.pause();
    media.removeAttribute('src');
    media.load();
    media.remove();
  }

  private onPlayState(media: HTMLMediaElement): void {
    const root = this.root;
    if (this.media !== media) return;
    if (!root) {
      // Em segundo plano: se o trecho parar sozinho, o botão da TV apaga e a música da cidade volta.
      this.deps.onBackgroundChange?.(!media.paused);
      this.deps.audio.suspendMusic(!media.paused);
      return;
    }
    $('[data-toggle]', root).textContent = media.paused ? '▶ Tocar' : '⏸ Pausar';
    root.querySelector('.tvs-radio')?.classList.toggle('is-playing', !media.paused);
  }

  private onTime(media: HTMLMediaElement): void {
    const root = this.root;
    if (this.media !== media) return;
    // Em segundo plano o trecho continua tocando; só não há tela para atualizar.
    if (!root) return;
    const duration = isFinite(media.duration) ? media.duration : 0;
    const seek = $<HTMLInputElement>('.tvs__seek', root);
    seek.max = String(Math.floor(duration));
    seek.value = String(Math.floor(media.currentTime));
    $('.tvs__clock', root).textContent = `${formatClock(media.currentTime)} / ${formatClock(duration)}`;
    this.renderSubtitle();
  }

  private renderSubtitle(): void {
    const root = this.root;
    const el = root?.querySelector<HTMLElement>('.tvs-tv__subs');
    if (!el || !this.media) return;
    const mode = this.deps.prefs.subtitles();
    const cue: SubtitleCueDto | null = mode === 'off' ? null : activeCue(this.cues[mode], this.media.currentTime);
    el.hidden = !cue;
    if (cue && el.textContent !== cue.text) el.textContent = cue.text;
  }

  private renderList(): void {
    const root = this.root;
    if (!root) return;
    $('.tvs__list', root).replaceChildren(...this.library.videos.map((v) => html(`
      <li>
        <button type="button" class="tvs-item${v.id === this.video?.id ? ' is-active' : ''}" data-id="${esc(v.id)}">
          ${v.thumbnail ? `<img src="${esc(v.thumbnail)}" alt="" loading="lazy">` : '<span class="tvs-item__nothumb">🎞</span>'}
          <span class="tvs-item__info">
            <strong class="jp">${esc(v.title)}</strong>
            <small>${esc(v.channel)}${v.channel ? ' · ' : ''}parte ${v.part} de ${v.parts}</small>
          </span>
        </button>
      </li>`)));
  }

  private saveProgress(videoId: string, part: number): void {
    const entry = this.library.videos.find((v) => v.id === videoId);
    if (entry) entry.part = part;
    this.library.lastVideoId = videoId;
    this.deps.api.saveTvProgress(this.deps.store.player.id, videoId, part).catch(() => {});
  }

  // ===== Texto do trecho =====

  private transcript(videoId: string, part: number): Promise<TvTranscriptDto> {
    const key = `${videoId}:${part}`;
    let pending = this.transcripts.get(key);
    if (!pending) {
      pending = this.deps.api.tvTranscript(videoId, part).catch(() => {
        this.transcripts.delete(key);
        return NO_TRANSCRIPT;
      });
      this.transcripts.set(key, pending);
    }
    return pending;
  }

  private toggleText(show: boolean): void {
    const root = this.root;
    if (!root) return;
    $('.tvs__main', root).hidden = show;
    $('.tvs-text', root).hidden = !show;
    if (show) {
      this.renderText();
      $('.tvs-text__body', root).focus();
    } else {
      $('[data-text]', root).focus();
    }
  }

  private textHeading(): string {
    return this.video ? `${this.video.title} — parte ${this.part} de ${this.video.parts}` : '';
  }

  private textLines(): string {
    const cues = this.cues[this.textLang];
    if (!cues.length) return `<p class="tvs-text__none">Este trecho não tem texto em ${LANG_LABEL[this.textLang]}.</p>`;
    return cues.map((c) => `<p>${esc(c.text)}</p>`).join('');
  }

  private renderText(): void {
    const root = this.root;
    const panel = root?.querySelector<HTMLElement>('.tvs-text');
    if (!panel) return;
    $('.tvs-text__title', panel).textContent = this.textHeading();
    $('.tvs-text__body', panel).innerHTML = this.textLines();
    panel.querySelectorAll<HTMLElement>('[data-lang]').forEach((btn) => {
      btn.classList.toggle('btn--primary', btn.dataset.lang === this.textLang);
    });
  }

  /** Imprime só o texto: a folha fica fora do jogo e o CSS de impressão esconde o resto. */
  private print(): void {
    document.querySelectorAll('.print-sheet').forEach((el) => el.remove());
    const sheet = html(`
      <div class="print-sheet">
        <h1>${esc(this.textHeading())}</h1>
        <p class="print-sheet__meta">Nihongo City · ${LANG_LABEL[this.textLang]}</p>
        ${this.textLines()}
      </div>`);
    document.body.append(sheet);
    const cleanup = (): void => {
      window.removeEventListener('afterprint', cleanup);
      sheet.remove();
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }
}
