import type {
  EventSource, ExpressionDto, FinishEventResponse, NpcDto, OptionDto, Outcome, RemoteAction, RemoteResult, ScenarioDto,
  StartEventResponse, StepDto,
} from '../../shared/contracts';
import type { AudioPort, GameApi, RemoteMicrophone, SpeechRecognizer } from '../application/ports';
import type { SpeechMatcher } from '../application/speech-matcher';
import type { Store } from '../application/store';
import { $, bump, esc, floatGain, html, npcImage, sleep, waitAdvance } from './dom';

const MAX_MISTAKES = 3;
const ABORT = Symbol('abort');

export interface DialogueDeps {
  store: Store;
  api: Pick<GameApi, 'startEvent' | 'attempt' | 'finishEvent'>;
  audio: AudioPort;
  voice: SpeechRecognizer;
  remote: RemoteMicrophone;
  matcher: SpeechMatcher;
}

/** Evento em andamento. */
interface RunningEvent {
  id: number;
  scenario: ScenarioDto;
  mistakes: number;
  seen: Set<number>;
  isAborted: boolean;
  aborted: Promise<typeof ABORT>;
  abort: () => void;
}

type StepResult = { option: OptionDto } | { failed: true } | { abort: true };

export interface StartEventOptions {
  locationId?: string;
  scenarioId?: string;
  source?: EventSource;
}

const body = (): HTMLElement => $('#dlg-body');

function setLives(mistakes: number): void {
  const lives = $('#dlg-lives');
  lives.textContent = '❤️'.repeat(MAX_MISTAKES - mistakes) + '🖤'.repeat(mistakes);
  lives.setAttribute('aria-label', `${MAX_MISTAKES - mistakes} tentativas restantes`);
}

function feedbackEl(kind: 'ok' | 'bad', title: string, saidText: string | null, message: string | null): HTMLElement {
  return html(`
    <div class="feedback feedback--${kind}" role="status">
      <p class="feedback__title">${title}</p>
      ${saidText ? `<p class="feedback__said">Você disse: <span class="jp" lang="ja">${esc(saidText)}</span></p>` : ''}
      ${message ? `<p>${esc(message)}</p>` : ''}
    </div>`);
}

/** Diálogo RPG: falas do NPC, vez do jogador (voz, clique ou celular) e o encerramento. */
export class DialogueView {
  /** Sem microfone (ou por escolha do jogador), as opções viram botões de resposta. */
  private clickMode = false;
  private current: RunningEvent | null = null;
  private dialogueResize: ResizeObserver | null = null;

  constructor(private readonly deps: DialogueDeps) {}

  init(): void {
    $('#dlg-close').addEventListener('click', () => this.current?.abort());
  }

  /** Ações do celular equivalem a apertar o botão visível no balão da TV. */
  handleRemoteAction(action: RemoteAction): void {
    const dlg = $('#dialogue');
    if (dlg.hidden) return;
    if (action === 'replay') dlg.querySelector<HTMLElement>('.dlg-replay')?.click();
    if (action === 'continue') {
      (dlg.querySelector<HTMLElement>('.dlg-actions .btn') || dlg.querySelector('.dlg-next')?.closest<HTMLElement>('.dlg-line'))?.click();
    }
  }

  async start({ locationId, scenarioId, source = 'click' }: StartEventOptions): Promise<void> {
    const { store, api, audio } = this.deps;
    if (store.state.eventOpen) return;
    store.state.eventOpen = true;
    audio.unlock();
    try {
      const data = await api.startEvent({ player: store.player.id, locationId, scenarioId, source });
      await this.run(data);
    } catch (err) {
      console.error(err);
      if (this.current) this.closeStage();
      store.state.eventOpen = false;
      alert((err as Error).message || 'Não foi possível iniciar o evento.');
    }
  }

  private get event(): RunningEvent {
    if (!this.current) throw new Error('Nenhum evento em andamento');
    return this.current;
  }

  /** Corre uma promessa contra o botão "sair": se o jogador sair, devolve ABORT. */
  private guard<T>(promise: Promise<T>): Promise<T | typeof ABORT> {
    return Promise.race([promise, this.event.aborted]);
  }

  /** Mostra uma fala do NPC letra por letra, com áudio. */
  private async sayLine(expr: ExpressionDto, { waitClick = false } = {}): Promise<HTMLElement> {
    const { store, audio, remote } = this.deps;
    const s = store.settings;
    const ev = this.event;
    const line = html(`
      <div class="dlg-line">
        <p class="dlg-text jp" lang="ja"></p>
        <div class="dlg-sub">
          ${s.show_romaji ? `<span class="dlg-romaji">${esc(expr.romaji)}</span>` : ''}
          ${s.show_translation ? `<span class="dlg-pt">${esc(expr.pt)}</span>` : ''}
        </div>
        <div class="dlg-line-row">
          <button type="button" class="btn btn--small btn--ghost dlg-replay" aria-label="Ouvir de novo">🔊 Ouvir de novo</button>
        </div>
      </div>`);
    body().replaceChildren(line);
    remote.setState({
      mode: 'npc', npc: ev.scenario.npc.nameJp, jp: expr.jp, romaji: expr.romaji, pt: expr.pt,
      canContinue: waitClick,
    });
    const textEl = $('.dlg-text', line);
    const npc = $('#npc-img');

    const speak = (): Promise<void> => {
      npc.classList.add('is-talking');
      return audio.speak(expr.audio, expr.jp).then(() => npc.classList.remove('is-talking'));
    };
    $('.dlg-replay', line).addEventListener('click', (e) => { e.stopPropagation(); void speak(); });
    void speak();

    // Efeito máquina de escrever; um clique completa o texto na hora.
    let skip = false;
    const skipper = waitAdvance(line).then(() => { skip = true; });
    const chars = [...expr.jp];
    for (let i = 0; i < chars.length && !skip && !ev.isAborted; i++) {
      textEl.textContent = chars.slice(0, i + 1).join('');
      if (i % 3 === 0) audio.sfx('blip');
      await sleep(s.text_speed);
    }
    textEl.textContent = expr.jp;
    $('.dlg-sub', line).classList.add('is-visible');

    if (waitClick) {
      line.append(html('<span class="dlg-next" aria-hidden="true">▼</span>'));
      await this.guard(skip ? waitAdvance(line) : skipper);
    }
    return line;
  }

  /** Vez do jogador: mostra opções e espera uma resposta certa (ou 3 erros). */
  private askPlayer(step: StepDto): Promise<StepResult> {
    const { store, api, audio, voice, remote, matcher } = this.deps;
    const ev = this.event;
    return new Promise((resolveStep) => {
      // Clique nas opções responde: por escolha, ou sem microfone local nem celular conectado.
      const answerMode = (): boolean => this.clickMode || (!remote.connected && (!voice.supported || voice.denied));
      const phoneMode = (): boolean => remote.connected && !this.clickMode;
      const optionEls = new Map<number, HTMLButtonElement>();
      const elOf = (o: OptionDto): HTMLButtonElement => optionEls.get(o.id) as HTMLButtonElement;
      let active = true;
      let lastResult: RemoteResult | null = null;
      let looping = false;
      let busy = false;
      const offRemote = store.onChange((what) => { if (what === 'remote' && active) refreshMode(); });
      const resolve = (value: StepResult): void => {
        if (!active) return;
        active = false;
        offRemote();
        remote.cancelListen();
        resolveStep(value);
      };
      const panel = html(`
        <div class="dialogue__body">
          <p class="dlg-prompt">🎯 ${esc(step.prompt)}</p>
          <div class="options"></div>
          <div class="answer-row">
            <button type="button" class="btn btn--primary mic-btn">🎤 Responder</button>
            <button type="button" class="btn btn--small btn--ghost mode-toggle"></button>
          </div>
          <p class="mic-status" aria-live="polite"></p>
          <div class="feedback-slot"></div>
        </div>`);
      const optionsEl = $('.options', panel);
      const micBtn = $<HTMLButtonElement>('.mic-btn', panel);
      const modeBtn = $<HTMLButtonElement>('.mode-toggle', panel);
      const status = $('.mic-status', panel);
      const slot = $('.feedback-slot', panel);
      const disableOptions = (): void => optionsEl.querySelectorAll<HTMLButtonElement>('.option').forEach((b) => { b.disabled = true; });

      const refreshMode = (): void => {
        if (!active) return;
        const byClick = answerMode();
        const canSpeak = remote.connected || (voice.supported && !voice.denied);
        micBtn.hidden = byClick || phoneMode();
        modeBtn.hidden = !canSpeak;
        modeBtn.textContent = byClick ? (remote.connected ? '📱 Responder pelo celular' : '🎤 Responder falando') : '⌨️ Responder clicando';
        if (byClick) {
          status.textContent = canSpeak ? 'Clique na frase que você diria.'
            : 'Sem reconhecimento de voz neste navegador. Clique na frase que você diria — ou conecte o celular em 📱.';
        } else if (phoneMode()) {
          status.innerHTML = '<span class="phone-hint">📱 Fale no celular</span> — a resposta aparece aqui.';
          void phoneLoop();
        } else {
          status.textContent = 'Toque numa opção para ouvir. Depois aperte Responder e fale em japonês.';
        }
        if (!phoneMode()) remote.cancelListen();
        optionsEl.querySelectorAll('.option__hint').forEach((h) => {
          h.textContent = byClick ? 'clique para responder' : '🔊 toque para ouvir';
        });
      };

      const handleSpeech = async (transcripts: string[]): Promise<void> => {
        if (!transcripts.length) return evaluate(null, '', 0);
        status.textContent = 'Analisando…';
        const { option, score } = await matcher.matchOption(transcripts, step.options);
        return evaluate(option, transcripts[0], score);
      };

      /** Enquanto o celular estiver conectado, cada fala recebida vira uma tentativa. */
      const phoneLoop = async (): Promise<void> => {
        if (looping) return;
        looping = true;
        while (active && phoneMode()) {
          const heard = await remote.listen({
            mode: 'answer',
            prompt: step.prompt,
            options: step.options.map((o) => ({ jp: o.expr.jp, romaji: o.expr.romaji, audio: o.expr.audio })),
            lives: MAX_MISTAKES - ev.mistakes,
            result: lastResult,
          });
          if (heard === null || !active) break;
          if (busy) continue;
          busy = true;
          await handleSpeech(heard);
          busy = false;
        }
        looping = false;
      };

      const evaluate = async (option: OptionDto | null, said: string | null, score: number): Promise<void> => {
        api.attempt(ev.id, { stepId: step.id, optionId: option?.id ?? null, transcript: said ?? '', similarity: score })
          .catch(() => {});
        step.options.forEach((o) => elOf(o).classList.remove('is-right', 'is-wrong'));

        if (option?.correct) {
          audio.sfx('correct');
          const el = elOf(option);
          el.classList.add('is-right');
          disableOptions();
          micBtn.hidden = true;
          modeBtn.hidden = true;
          status.textContent = '';
          floatGain('+1 🃏', el);
          const fb = feedbackEl('ok', '正解！ Muito bem!', said, option.feedback);
          const next = html('<div class="dlg-actions"><button type="button" class="btn btn--primary">Continuar ▶</button></div>');
          slot.replaceChildren(fb, next);
          remote.setState({ mode: 'result', result: { ok: true, title: '正解！ Muito bem!', said, message: option.feedback }, canContinue: true });
          const btn = $('button', next);
          btn.focus();
          void audio.speak(option.expr.audio, option.expr.jp);
          await this.guard(waitAdvance(btn));
          resolve({ option });
          return;
        }

        ev.mistakes += 1;
        setLives(ev.mistakes);
        audio.sfx('wrong');
        if (option) elOf(option).classList.add('is-wrong');
        const message = option
          ? option.feedback
          : 'Não entendi bem. Ouça as opções e tente falar de novo, com calma.';
        const title = option ? '✗ Não é bem isso…' : '？ Não entendi';

        if (ev.mistakes >= MAX_MISTAKES) {
          disableOptions();
          micBtn.hidden = true;
          modeBtn.hidden = true;
          status.textContent = '';
          const correct = step.options.find((o) => o.correct);
          if (correct) elOf(correct).classList.add('is-right');
          const next = html('<div class="dlg-actions"><button type="button" class="btn">Continuar ▶</button></div>');
          const full = `${message} A resposta era: ${correct?.expr.jp}`;
          slot.replaceChildren(feedbackEl('bad', title, said, full), next);
          remote.setState({ mode: 'result', result: { ok: false, title, said, message: full }, canContinue: true });
          const btn = $('button', next);
          btn.focus();
          await this.guard(waitAdvance(btn));
          resolve({ failed: true });
          return;
        }
        slot.replaceChildren(feedbackEl('bad', title, said, message));
        lastResult = { ok: false, title, said, message };
        refreshMode();
      };

      step.options.forEach((opt) => {
        const btn = html<HTMLButtonElement>(`
          <button type="button" class="option" data-id="${opt.id}">
            <span class="option__jp" lang="ja">${esc(opt.expr.jp)}</span>
            ${store.settings.show_romaji ? `<span class="option__ro">${esc(opt.expr.romaji)}</span>` : ''}
            <span class="option__hint"></span>
          </button>`);
        btn.addEventListener('click', async () => {
          if (busy) return;
          btn.classList.add('is-playing');
          const playing = audio.speak(opt.expr.audio, opt.expr.jp);
          if (answerMode()) {
            busy = true;
            await playing;
            btn.classList.remove('is-playing');
            await evaluate(opt, null, 1);
            busy = false;
          } else {
            void playing.then(() => btn.classList.remove('is-playing'));
          }
        });
        optionEls.set(opt.id, btn);
        optionsEl.append(btn);
      });

      modeBtn.addEventListener('click', () => { this.clickMode = !this.clickMode; refreshMode(); });

      micBtn.addEventListener('click', async () => {
        if (busy) return;
        busy = true;
        audio.stopVoice();
        micBtn.classList.add('is-listening');
        micBtn.textContent = '🎙️ Ouvindo…';
        status.textContent = 'Fale agora, em japonês.';
        try {
          const transcripts = await voice.listen({ onStart: () => audio.sfx('click') });
          micBtn.classList.remove('is-listening');
          micBtn.textContent = '🎤 Responder';
          if (ev.isAborted) return;
          await handleSpeech(transcripts);
        } catch (err) {
          micBtn.classList.remove('is-listening');
          micBtn.textContent = '🎤 Responder';
          if ((err as Error).message === 'denied') {
            slot.replaceChildren(feedbackEl('bad', '🎤 Microfone bloqueado', '', 'Libere o microfone nas permissões do navegador ou responda clicando nas opções.'));
          } else {
            status.textContent = 'Não consegui usar o microfone agora. Tente de novo.';
          }
          refreshMode();
        } finally {
          busy = false;
        }
      });

      body().append(...Array.from(panel.children));
      refreshMode();
      void ev.aborted.then(() => resolve({ abort: true }));
    });
  }

  private async showEnding(outcome: Outcome, scenario: ScenarioDto, result: FinishEventResponse | null): Promise<void> {
    const { audio, remote } = this.deps;
    audio.sfx(outcome === 'success' ? 'card' : 'fail');
    const title = outcome === 'success' ? '🎉 Evento concluído!' : '🌙 Não foi dessa vez…';
    const newCards = result?.newCards || [];
    const chips = newCards.length
      ? `<div class="culture__cards">${newCards.map((c) => `<span class="chip" lang="ja">${esc(c.jp)}</span>`).join('')}</div>`
      : '';
    const panel = html(`
      <div class="culture">
        <p class="culture__result">${title} ${result ? `+${result.xpGain} XP` : ''}</p>
        ${newCards.length ? `<p>🃏 ${newCards.length} nova(s) carta(s) no seu baralho:</p>${chips}` : ''}
        <h3 class="culture__title">🎌 Dica cultural</h3>
        <p class="culture__text">${esc(scenario.culture)}</p>
        <div class="dlg-actions"><button type="button" class="btn btn--primary">Voltar à cidade ▶</button></div>
      </div>`);
    body().replaceChildren(panel);
    remote.setState({
      mode: 'ending', title, xp: result?.xpGain ?? 0,
      cards: newCards.map((c) => c.jp), culture: scenario.culture, canContinue: true,
    });
    const btn = $('button', panel);
    btn.focus();
    if (newCards.length) bump($('#btn-deck'));
    await this.guard(waitAdvance(btn));
  }

  private openStage(npc: NpcDto): void {
    $('#game').classList.add('is-busy');
    $('#veil').hidden = false;
    const img = $<HTMLImageElement>('#npc-img');
    img.alt = `${npc.namePt} (${npc.nameJp})`;
    npcImage(img, npc.image);
    $('#npc-layer').hidden = false;
    $('#dlg-name').innerHTML = `${esc(npc.nameJp)}<small>${esc(npc.namePt)}</small>`;
    setLives(0);
    $('#dialogue').hidden = false;
    this.followDialogueHeight();
  }

  /** Mantém o NPC apoiado no topo do balão, qualquer que seja a altura dele. */
  private followDialogueHeight(): void {
    const dialogue = $('#dialogue');
    const layer = $('#npc-layer');
    this.dialogueResize?.disconnect();
    this.dialogueResize = new ResizeObserver(() => {
      layer.style.setProperty('--dlg-h', `${dialogue.offsetHeight}px`);
    });
    this.dialogueResize.observe(dialogue);
  }

  private closeStage(): void {
    const { store, audio, remote } = this.deps;
    audio.stopVoice();
    remote.cancelListen();
    remote.setState({ mode: 'idle' });
    this.dialogueResize?.disconnect();
    this.dialogueResize = null;
    $('#dialogue').hidden = true;
    $('#npc-layer').hidden = true;
    $('#veil').hidden = true;
    $('#game').classList.remove('is-busy');
    body().replaceChildren();
    store.state.eventOpen = false;
    store.state.lastInteraction = Date.now();
    this.current = null;
    store.emit('event-closed');
  }

  private async finish(outcome: Outcome): Promise<FinishEventResponse | null> {
    const { store, api } = this.deps;
    const ev = this.event;
    try {
      const result = await api.finishEvent(ev.id, { outcome, seenStepIds: [...ev.seen] });
      store.player.xp = result.xp;
      store.player.level = result.level;
      store.state.stats.cards += result.newCards.length;
      store.state.stats.due += result.newCards.length;
      store.emit('profile');
      return result;
    } catch (err) {
      console.warn('Falha ao encerrar evento', err);
      return null;
    }
  }

  private async run({ eventId, scenario }: StartEventResponse): Promise<void> {
    let abortResolve!: () => void;
    const ev: RunningEvent = {
      id: eventId,
      scenario,
      mistakes: 0,
      seen: new Set(),
      isAborted: false,
      aborted: new Promise<void>((r) => { abortResolve = r; }).then(() => ABORT),
      abort: () => { ev.isAborted = true; abortResolve(); },
    };
    this.current = ev;
    this.openStage(scenario.npc);

    const byKey = new Map(scenario.steps.map((s) => [s.key, s]));
    let step: StepDto | undefined = scenario.steps[0];
    let outcome: Outcome = 'success';

    while (step) {
      ev.seen.add(step.id);
      await this.sayLine(step.npc);
      if (ev.isAborted) break;
      const res = await this.askPlayer(step);
      if ('abort' in res || ev.isAborted) break;
      if ('failed' in res) {
        outcome = 'failed';
        await this.sayLine(scenario.farewell, { waitClick: true });
        break;
      }
      step = res.option.next ? byKey.get(res.option.next) : undefined;
    }

    if (ev.isAborted) {
      await this.finish('abandoned');
      this.closeStage();
      return;
    }
    const result = await this.finish(outcome);
    await this.showEnding(outcome, scenario, result);
    this.closeStage();
  }
}
