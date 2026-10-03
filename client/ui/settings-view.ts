import type { SettingsDto } from '../../shared/contracts';
import type { GameApi } from '../application/ports';
import type { SettingsService } from '../application/settings-service';
import type { Store } from '../application/store';
import { $, html } from './dom';
import type { Modal } from './modal';

export interface SettingsViewDeps {
  store: Store;
  settings: SettingsService;
  api: Pick<GameApi, 'resetProgress'>;
  modal: Modal;
}

type Key = keyof SettingsDto;

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const ms = (v: number): string => `${v} ms`;

export class SettingsView {
  constructor(private readonly deps: SettingsViewDeps) {}

  private toggle(key: Key, label: string, hint = ''): string {
    return `
      <label class="setting">
        <span>${label}</span>
        <span class="switch"><input type="checkbox" data-key="${key}" ${this.deps.store.settings[key] ? 'checked' : ''}><span></span></span>
        ${hint ? `<small>${hint}</small>` : ''}
      </label>`;
  }

  private slider(key: Key, label: string, min: number, max: number, step: number, fmt: (v: number) => string): string {
    const value = Number(this.deps.store.settings[key]);
    return `
      <label class="setting">
        <span>${label}</span>
        <output data-out="${key}">${fmt(value)}</output>
        <input type="range" data-key="${key}" data-fmt="${fmt === pct ? 'pct' : 'ms'}"
          min="${min}" max="${max}" step="${step}" value="${value}">
      </label>`;
  }

  open(): void {
    const s = this.deps.store.settings;
    const content = html(`
      <form class="settings" onsubmit="return false">
        <fieldset>
          <legend>🎵 Som</legend>
          ${this.toggle('music_on', 'Música de fundo')}
          ${this.slider('music_volume', 'Volume da música', 0, 0.3, 0.01, pct)}
          ${this.slider('voice_volume', 'Volume das falas', 0.5, 1, 0.05, pct)}
          ${this.toggle('sfx_on', 'Efeitos sonoros')}
          ${this.slider('sfx_volume', 'Volume dos efeitos', 0, 1, 0.05, pct)}
        </fieldset>
        <fieldset>
          <legend>💬 Diálogos</legend>
          ${this.toggle('show_romaji', 'Mostrar romaji', 'Leitura em letras latinas abaixo do japonês.')}
          ${this.toggle('show_translation', 'Mostrar tradução', 'Desligue para treinar a compreensão.')}
          ${this.slider('text_speed', 'Intervalo entre letras', 10, 120, 5, ms)}
        </fieldset>
        <fieldset>
          <legend>🔔 Convites de eventos</legend>
          ${this.toggle('invites_on', 'Receber convites', 'Quando você fica parado, NPCs chamam você para uma interação.')}
          <label class="setting">
            <span>Frequência</span>
            <select data-key="invite_frequency">
              <option value="pouco" ${s.invite_frequency === 'pouco' ? 'selected' : ''}>Pouco (3–5 min)</option>
              <option value="normal" ${s.invite_frequency === 'normal' ? 'selected' : ''}>Normal (1,5–3 min)</option>
              <option value="muito" ${s.invite_frequency === 'muito' ? 'selected' : ''}>Muito (45–90 s)</option>
            </select>
          </label>
        </fieldset>
        <fieldset>
          <legend>⚠️ Progresso</legend>
          <button type="button" class="btn btn--bad" data-reset>Apagar baralho e progresso</button>
        </fieldset>
      </form>`);

    content.addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const key = el.dataset.key as Key | undefined;
      if (!key) return;
      let value: boolean | number | string;
      if (el instanceof HTMLInputElement && el.type === 'checkbox') value = el.checked;
      else if (el instanceof HTMLInputElement && el.type === 'range') {
        value = Number(el.value);
        $(`[data-out="${key}"]`, content).textContent = el.dataset.fmt === 'pct' ? pct(value) : ms(value);
      } else value = el.value;
      this.deps.settings.save({ [key]: value });
    });

    $('[data-reset]', content).addEventListener('click', async () => {
      if (!confirm('Apagar todas as cartas, revisões e XP? Isso não pode ser desfeito.')) return;
      const { store } = this.deps;
      const p = await this.deps.api.resetProgress(store.player.id);
      store.state.player = p.player;
      store.state.stats = p.stats;
      store.emit('profile');
      this.deps.modal.close();
    });

    this.deps.modal.open('⚙ Configurações', content, { narrow: true });
  }
}
