import type { InviteDto, InviteFrequency } from '../../shared/contracts';
import type { AudioPort, GameApi } from '../application/ports';
import type { Store } from '../application/store';
import { $, esc, html, npcImage } from './dom';

const FREQUENCY: Record<InviteFrequency, [number, number]> = { pouco: [180, 300], normal: [90, 180], muito: [45, 90] }; // segundos
const IDLE_MS = 15000;
const TOAST_MS = 20000;
const TICK_MS = 3000;

export interface InvitesDeps {
  store: Store;
  api: Pick<GameApi, 'nextInvite'>;
  audio: Pick<AudioPort, 'sfx'>;
  startEvent: (scenarioId: string) => void;
}

/** Quando o jogador fica parado, um NPC aparece num toast convidando para um evento. */
export class Invites {
  private nextAt = 0;
  private toastOpen = false;

  constructor(private readonly deps: InvitesDeps) {}

  init(): void {
    this.reschedule();
    const touch = (): void => { this.deps.store.state.lastInteraction = Date.now(); };
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => addEventListener(ev, touch, { passive: true }));
    setInterval(() => { void this.tick(); }, TICK_MS);
  }

  /** Recalcula o próximo convite (ex.: quando a frequência muda). */
  reschedule(): void {
    const [min, max] = FREQUENCY[this.deps.store.settings.invite_frequency] || FREQUENCY.normal;
    this.nextAt = Date.now() + (min + Math.random() * (max - min)) * 1000;
  }

  private dismiss(el: HTMLElement): void {
    if (!el.isConnected) return;
    el.classList.add('is-leaving');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    this.toastOpen = false;
    this.reschedule();
  }

  private showToast(invite: InviteDto): void {
    this.toastOpen = true;
    const el = html(`
      <div class="toast" role="alert">
        <img class="toast__face" alt="">
        <p class="toast__text">🔔 ${esc(invite.textPt)}<span class="toast__jp" lang="ja">${esc(invite.textJp || '')}</span></p>
        <div class="toast__actions">
          <button type="button" class="btn btn--primary btn--small" data-go>Participar</button>
          <button type="button" class="btn btn--ghost btn--small" data-no aria-label="Dispensar">✕</button>
        </div>
        <span class="toast__timer"></span>
      </div>`);
    npcImage($<HTMLImageElement>('.toast__face', el), invite.npc.image);
    $('.toast__timer', el).animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: TOAST_MS, easing: 'linear' });
    const timer = setTimeout(() => this.dismiss(el), TOAST_MS);
    $('[data-no]', el).addEventListener('click', () => { clearTimeout(timer); this.dismiss(el); });
    $('[data-go]', el).addEventListener('click', () => {
      clearTimeout(timer);
      this.dismiss(el);
      this.deps.startEvent(invite.scenarioId);
    });
    $('#toasts').append(el);
    this.deps.audio.sfx('notify');
  }

  private async tick(): Promise<void> {
    const { store, api } = this.deps;
    const s = store.state;
    if (!s.settings?.invites_on || this.toastOpen || s.eventOpen || s.modalOpen || document.hidden) return;
    if (Date.now() - s.lastInteraction < IDLE_MS || Date.now() < this.nextAt) return;
    try {
      const invite = await api.nextInvite(store.player.id);
      if (invite && !s.eventOpen && !s.modalOpen) this.showToast(invite);
      else this.reschedule();
    } catch {
      this.reschedule();
    }
  }
}
