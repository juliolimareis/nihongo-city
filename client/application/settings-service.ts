import type { SettingsDto } from '../../shared/contracts';
import type { AudioPort, GameApi } from './ports';
import type { Store } from './store';

const SAVE_DELAY_MS = 400;

/** Aplica configurações na hora e salva no servidor com debounce. */
export class SettingsService {
  private pending: Partial<SettingsDto> = {};
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly store: Store,
    private readonly api: Pick<GameApi, 'saveSettings'>,
    private readonly audio: Pick<AudioPort, 'applySettings'>,
  ) {}

  save(patch: Partial<SettingsDto>): void {
    Object.assign(this.store.settings, patch);
    Object.assign(this.pending, patch);
    this.audio.applySettings();
    this.store.emit('settings');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, SAVE_DELAY_MS);
  }

  private async flush(): Promise<void> {
    const body = this.pending;
    this.pending = {};
    try {
      const saved = await this.api.saveSettings(this.store.player.id, body);
      this.store.state.settings = { ...this.store.settings, ...saved };
      // O limite diário muda quantas cartas o HUD mostra para hoje.
      if ('daily_new_cards' in body || 'daily_reviews' in body) this.store.emit('refresh-profile');
    } catch (err) {
      console.warn('Não foi possível salvar as configurações', err);
    }
  }
}
