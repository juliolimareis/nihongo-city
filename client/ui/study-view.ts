import type { CardDto, Rating, StudyDayDto, StudyMode } from '../../shared/contracts';
import type { AudioPort, GameApi, RemoteMicrophone, SpeechRecognizer } from '../application/ports';
import type { SpeechMatcher } from '../application/speech-matcher';
import type { Store } from '../application/store';
import { shuffle } from '../domain/progress';
import { matchTranslation, normalizeJp, similarity } from '../domain/text-match';
import { $, esc, html } from './dom';
import { createKanaKeyboard } from './kana-keyboard';
import type { Modal } from './modal';

type ModeChoice = StudyMode | 'random';

const MODES: Record<ModeChoice, { label: string; title?: string }> = {
  random: { label: '🎲 Misturado' },
  audio: { label: '🔊 Ouvir e repetir', title: 'Ouça e repita em voz alta' },
  read: { label: '📖 Ler e traduzir', title: 'Traduza para o português' },
  write: { label: '✍️ Escrever em kana', title: 'Escreva em japonês' },
};
const SESSION_SIZE = 20;
const WRITE_MAX_LEN = 14;
const PASS_SPEECH = 0.75;
const PASS_TRANSLATION = 0.75;
const PASS_WRITING = 0.9;

export interface StudyViewDeps {
  store: Store;
  api: Pick<GameApi, 'cards' | 'dueCards' | 'review'>;
  audio: Pick<AudioPort, 'speak' | 'stopVoice' | 'sfx'>;
  voice: SpeechRecognizer;
  remote: RemoteMicrophone;
  matcher: SpeechMatcher;
  modal: Modal;
}

/** Sessão de revisão espaçada: ouvir e repetir, ler e traduzir, escrever em kana. */
export class StudyView {
  private fixedMode: ModeChoice = 'random';

  constructor(private readonly deps: StudyViewDeps) {}

  private feasibleModes(card: CardDto): StudyMode[] {
    const { remote, voice } = this.deps;
    const modes: StudyMode[] = ['read'];
    if (remote.connected || (voice.supported && !voice.denied)) modes.push('audio');
    if (normalizeJp(card.kana).length <= WRITE_MAX_LEN) modes.push('write');
    return modes;
  }

  private pickMode(card: CardDto): StudyMode {
    const ok = this.feasibleModes(card);
    if (this.fixedMode !== 'random' && ok.includes(this.fixedMode)) return this.fixedMode;
    return ok[Math.floor(Math.random() * ok.length)];
  }

  async open({ practice = false } = {}): Promise<void> {
    const { store, api, audio, voice, remote, matcher, modal } = this.deps;
    const playerId = store.player.id;
    const root = html('<div class="study"></div>');
    modal.open('📖 Estudar', root, {
      onClose: () => {
        remote.cancelListen();
        remote.setState({ mode: 'idle' });
        store.emit('refresh-profile');
      },
    });

    let today: StudyDayDto | null = null;
    let queue: CardDto[];
    if (practice) queue = shuffle(await api.cards(playerId)).slice(0, 15);
    else ({ cards: queue, today } = await api.dueCards(playerId, SESSION_SIZE));

    if (!queue.length) {
      const total = (await api.cards(playerId)).length;
      const held = today ? today.held : 0;
      let icon = '🗺️';
      let title = 'Seu baralho está vazio';
      let text = 'Explore a cidade e converse com os NPCs — cada frase vira uma carta.';
      if (today && held) {
        icon = '🌙';
        title = 'Limite de hoje atingido!';
        text = `Hoje você já estudou ${today.newDone} de ${today.newLimit} cartas novas e ${today.reviewsDone} de ${today.reviewsLimit} revisões. `
          + `${held} carta(s) ficam para amanhã — o limite pode ser mudado nas configurações.`;
      } else if (total) {
        icon = '🎉';
        title = 'Nenhuma carta para revisar agora!';
        text = 'Você está em dia. Volte mais tarde ou pratique as cartas que já tem.';
      }
      root.replaceChildren(html(`
        <div class="study__done">
          <p style="font-size:2.5rem;margin:0">${icon}</p>
          <h3>${title}</h3>
          <p>${text}</p>
          <div class="study__row">
            ${total ? '<button type="button" class="btn btn--primary" data-practice>Praticar mesmo assim</button>' : ''}
            <button type="button" class="btn" data-close>Voltar à cidade</button>
          </div>
        </div>`));
      root.querySelector('[data-practice]')?.addEventListener('click', () => { void this.open({ practice: true }); });
      $('[data-close]', root).addEventListener('click', () => modal.close());
      return;
    }

    const total = queue.length;
    let done = 0;
    let correctCount = 0;
    const requeued = new Set<string>();

    const top = html(`
      <div class="study__top">
        <div class="study__progress"><span style="width:0%"></span></div>
        <span class="study__count"></span>
      </div>`);
    const modes = html(`<div class="study__modes" role="group" aria-label="Modo de estudo">
      ${(Object.keys(MODES) as ModeChoice[]).map((k) =>
        `<button type="button" class="mode-btn" data-mode="${k}" aria-pressed="${k === this.fixedMode}">${MODES[k].label}</button>`).join('')}
    </div>`);
    const stage = html('<div></div>');
    root.replaceChildren(top, modes, stage);

    modes.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-mode]');
      if (!b) return;
      this.fixedMode = b.dataset.mode as ModeChoice;
      modes.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      showCard();
    });

    const updateProgress = (): void => {
      $('.study__progress span', top).style.width = `${(done / total) * 100}%`;
      $('.study__count', top).textContent = `${done}/${total}${practice ? ' · prática livre' : ''}`;
    };

    // Cartas do limite de hoje que não couberam nesta sessão.
    const left = today ? Math.max(0, today.available - total) : 0;

    const finishSession = (): void => {
      stage.replaceChildren(html(`
        <div class="study__done">
          <p style="font-size:2.5rem;margin:0">🌸</p>
          <h3 lang="ja">お疲れ様でした！</h3>
          <p>Sessão concluída: ${correctCount} de ${total} acertos de primeira.</p>
          ${left ? `<p>Ainda há ${left} carta(s) no limite de hoje.</p>` : ''}
          <div class="study__row">
            ${left ? '<button type="button" class="btn btn--primary" data-next>Continuar revisando</button>' : ''}
            <button type="button" class="btn${left ? '' : ' btn--primary'}" data-more>Praticar mais</button>
            <button type="button" class="btn" data-close>Voltar à cidade</button>
          </div>
        </div>`));
      modes.hidden = true;
      audio.sfx('card');
      stage.querySelector('[data-next]')?.addEventListener('click', () => { void this.open(); });
      $('[data-more]', stage).addEventListener('click', () => { void this.open({ practice: true }); });
      $('[data-close]', stage).addEventListener('click', () => modal.close());
    };

    const showAnswer = (card: CardDto, mode: StudyMode, ok: boolean, extra = ''): void => {
      audio.sfx(ok ? 'correct' : 'wrong');
      if (mode === 'audio') {
        remote.setState({ mode: 'result', result: { ok, title: ok ? '✓ Correto!' : '✗ Ainda não…', message: `${card.jp} — ${card.pt}` } });
      }
      const suggested: Rating = ok ? 'good' : 'again';
      const panel = html(`
        <div class="study__answer ${ok ? 'is-ok' : 'is-bad'}">
          <p class="study__verdict">${ok ? '✓ Correto!' : '✗ Ainda não…'}</p>
          ${extra}
          <p class="jp" lang="ja">${esc(card.jp)}</p>
          <p><span lang="ja">${esc(card.kana)}</span> · <i>${esc(card.romaji)}</i></p>
          <p><b>${esc(card.pt)}</b></p>
          ${card.usage ? `<small>💡 ${esc(card.usage)}</small>` : ''}
        </div>`);
      const ratings = html(`
        <div class="ratings">
          <button type="button" class="rating rating--again" data-r="again">Errei<small>de novo hoje</small></button>
          <button type="button" class="rating rating--hard" data-r="hard">Difícil<small>em breve</small></button>
          <button type="button" class="rating rating--good" data-r="good">Bom<small>no prazo</small></button>
          <button type="button" class="rating rating--easy" data-r="easy">Fácil<small>mais tarde</small></button>
        </div>`);
      $(`[data-r=${suggested}]`, ratings).classList.add('is-suggested');
      const view = stage.firstElementChild as HTMLElement;
      view.querySelectorAll('[data-check], .study__input, .kana-kb, [data-mic]').forEach((n) => n.remove());
      view.append(panel, ratings);
      // Foco no próximo frame: o mesmo Enter que verificou não pode "clicar" a avaliação.
      requestAnimationFrame(() => $('.is-suggested', ratings).focus());
      void audio.speak(card.audio, card.jp);

      ratings.addEventListener('click', async (e) => {
        const b = (e.target as Element).closest<HTMLElement>('[data-r]');
        if (!b) return;
        ratings.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        const rating = b.dataset.r as Rating;
        if (!practice) {
          try { await api.review(playerId, card.id, mode, rating); } catch (err) { console.warn(err); }
        }
        if (rating === 'again' && !requeued.has(card.id)) {
          requeued.add(card.id);
          queue.push(card);
        } else {
          done += 1;
          if (!requeued.has(card.id) && ok) correctCount += 1;
        }
        queue.shift();
        updateProgress();
        showCard();
      });
    };

    const showAudioMode = (card: CardDto, view: HTMLElement): void => {
      const play = html('<button type="button" class="icon-btn study__big-audio" aria-label="Ouvir">🔊</button>');
      const row = html(`<div class="study__row">
        <button type="button" class="btn btn--primary mic-btn" data-mic>🎤 Repetir</button>
        <button type="button" class="btn btn--ghost" data-check>Mostrar resposta</button>
      </div>`);
      const status = html('<p class="mic-status" aria-live="polite">Ouça e repita a frase em voz alta.</p>');
      view.append(play, row, status);
      play.addEventListener('click', () => { void audio.speak(card.audio, card.jp); });
      void audio.speak(card.audio, card.jp);
      $('[data-check]', row).addEventListener('click', () => showAnswer(card, 'audio', false));
      const mic = $<HTMLButtonElement>('[data-mic]', row);
      const judge = async (heard: string[]): Promise<boolean> => {
        if (!heard.length) {
          status.textContent = 'Não ouvi nada. Tente de novo, mais perto do microfone.';
          return false;
        }
        const score = await matcher.scoreSpeech(heard, card);
        showAnswer(card, 'audio', score >= PASS_SPEECH,
          `<p><small>Você disse:</small> <span class="jp" lang="ja">${esc(heard[0])}</span> <small>(${Math.round(score * 100)}% parecido)</small></p>`);
        return true;
      };

      if (remote.connected) {
        // Com o celular, a TV só espera: o jogador fala no celular.
        mic.hidden = true;
        status.innerHTML = '<span class="phone-hint">📱 Repita no celular</span> — o resultado aparece aqui.';
        void (async () => {
          for (;;) {
            const heard = await remote.listen({ mode: 'repeat', audio: card.audio });
            if (heard === null || queue[0] !== card) return;
            if (await judge(heard)) return;
          }
        })();
      }

      mic.addEventListener('click', async () => {
        mic.disabled = true;
        mic.classList.add('is-listening');
        mic.textContent = '🎙️ Ouvindo…';
        try {
          await judge(await voice.listen());
        } catch {
          status.textContent = 'Microfone indisponível. Use "Mostrar resposta" ou outro modo.';
        } finally {
          mic.disabled = false;
          mic.classList.remove('is-listening');
          mic.textContent = '🎤 Repetir';
        }
      });
    };

    const showReadMode = (card: CardDto, view: HTMLElement): void => {
      view.append(
        html(`<p class="study__question" lang="ja">${esc(card.jp)}</p>`),
        html('<button type="button" class="icon-btn audio-btn" aria-label="Ouvir">🔊</button>'),
        html('<input class="study__input" type="text" placeholder="Digite a tradução em português" aria-label="Tradução" autocomplete="off">'),
        html('<div class="study__row" data-check><button type="button" class="btn btn--primary">Verificar</button><button type="button" class="btn btn--ghost" data-skip>Não sei</button></div>'),
      );
      const input = $<HTMLInputElement>('.study__input', view);
      $('.audio-btn', view).addEventListener('click', () => { void audio.speak(card.audio, card.jp); });
      const check = (): void => {
        const typed = input.value;
        const score = matchTranslation(typed, card.pt);
        showAnswer(card, 'read', score >= PASS_TRANSLATION, typed ? `<p><small>Você escreveu:</small> ${esc(typed)}</p>` : '');
      };
      $('[data-check] .btn--primary', view).addEventListener('click', check);
      $('[data-skip]', view).addEventListener('click', () => showAnswer(card, 'read', false));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); check(); }
      });
      input.focus();
    };

    const showWriteMode = (card: CardDto, view: HTMLElement): void => {
      const compose = html('<div class="study__compose" lang="ja" aria-live="polite"></div>');
      const kb = createKanaKeyboard(audio, { onChange: (v) => { compose.textContent = v; } });
      view.append(
        html(`<p class="study__question study__question--pt">${esc(card.pt)}</p>`),
        compose,
        kb.el,
        html('<div class="study__row" data-check><button type="button" class="btn btn--primary">Verificar</button><button type="button" class="btn btn--ghost" data-skip>Não sei</button></div>'),
      );
      $('[data-check] .btn--primary', view).addEventListener('click', async () => {
        const typed = normalizeJp(kb.value);
        const [reading] = await matcher.readingsOf([card.jp]);
        const score = Math.max(similarity(typed, normalizeJp(card.kana)), similarity(typed, reading));
        showAnswer(card, 'write', score >= PASS_WRITING,
          kb.value ? `<p><small>Você escreveu:</small> <span class="jp" lang="ja">${esc(kb.value)}</span></p>` : '');
      });
      $('[data-skip]', view).addEventListener('click', () => showAnswer(card, 'write', false));
    };

    const showCard = (): void => {
      audio.stopVoice();
      remote.cancelListen();
      remote.setState({ mode: 'idle' });
      const card = queue[0];
      if (!card) { finishSession(); return; }
      const mode = this.pickMode(card);
      const view = html(`
        <div class="study__card">
          <p class="study__mode-label">${MODES[mode].label} · ${MODES[mode].title}</p>
        </div>`);
      stage.replaceChildren(view);
      if (mode === 'audio') showAudioMode(card, view);
      if (mode === 'read') showReadMode(card, view);
      if (mode === 'write') showWriteMode(card, view);
    };

    updateProgress();
    showCard();
  }
}
