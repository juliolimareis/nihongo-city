import type { CardDto, CardFilter } from '../../shared/contracts';
import type { AudioPort, GameApi } from '../application/ports';
import type { Store } from '../application/store';
import { isDue, relativeDue } from '../domain/progress';
import { $, esc, html } from './dom';
import { CATEGORIES, POLITENESS } from './labels';
import type { Modal } from './modal';

export interface DeckViewDeps {
  store: Store;
  api: Pick<GameApi, 'cards'>;
  audio: Pick<AudioPort, 'speak'>;
  modal: Modal;
  openStudy: () => void;
}

/** Baralho: cartas viráveis, busca e filtros. */
export class DeckView {
  constructor(private readonly deps: DeckViewDeps) {}

  private cardEl(c: CardDto): HTMLElement {
    const { audio } = this.deps;
    const el = html(`
      <article class="flashcard">
        <div class="flashcard__inner">
          <div class="flashcard__face flashcard__face--front" tabindex="0" role="button" aria-label="Virar carta: ${esc(c.jp)}">
            <p class="flashcard__jp" lang="ja">${esc(c.jp)}</p>
            <div class="flashcard__tags">
              <span class="tag tag--${esc(c.politeness)}">${esc(POLITENESS[c.politeness] || c.politeness)}</span>
              <span class="tag">${esc(CATEGORIES[c.category] || c.category)}</span>
              ${isDue(c.dueAt) ? '<span class="tag tag--due">pendente</span>' : ''}
            </div>
            <span class="flashcard__hint">toque para virar</span>
          </div>
          <div class="flashcard__face flashcard__face--back" tabindex="-1">
            <div class="flashcard__row">
              <div>
                <p class="flashcard__kana" lang="ja">${esc(c.kana)}</p>
                <p class="flashcard__romaji">${esc(c.romaji)}</p>
              </div>
              <button type="button" class="icon-btn audio-btn" aria-label="Ouvir">🔊</button>
            </div>
            <p class="flashcard__pt">${esc(c.pt)}</p>
            ${c.usage ? `<p class="flashcard__usage"><b>Como usar no Japão:</b> ${esc(c.usage)}</p>` : ''}
            ${c.culture ? `<p class="flashcard__usage"><b>Cultura:</b> ${esc(c.culture)}</p>` : ''}
            <p class="flashcard__meta">✓ ${c.hits} · ✗ ${c.misses} · ${relativeDue(c.dueAt)}</p>
          </div>
        </div>
      </article>`);
    const front = $('.flashcard__face--front', el);
    const flip = (): void => {
      el.classList.toggle('is-flipped');
      if (el.classList.contains('is-flipped')) void audio.speak(c.audio, c.jp);
    };
    front.addEventListener('click', flip);
    front.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); }
    });
    $('.flashcard__face--back', el).addEventListener('click', (e) => {
      if (!(e.target as Element).closest('button')) el.classList.remove('is-flipped');
    });
    $('.audio-btn', el).addEventListener('click', () => { void audio.speak(c.audio, c.jp); });
    return el;
  }

  async open(): Promise<void> {
    const { store, api } = this.deps;
    const content = html(`
      <div class="deck">
        <div class="deck__toolbar">
          <input type="search" placeholder="Buscar (japonês, romaji ou português)" aria-label="Buscar cartas" autofocus>
          <select aria-label="Categoria">
            <option value="">Todas as categorias</option>
            ${Object.entries(CATEGORIES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
          </select>
          <label class="setting" style="display:flex;gap:.5rem">
            <span class="switch"><input type="checkbox" data-due><span></span></span>
            <span>Só pendentes</span>
          </label>
          <button type="button" class="btn btn--primary" data-study>📖 Estudar</button>
        </div>
        <p class="deck__summary"></p>
        <div class="deck__grid"></div>
      </div>`);
    const search = $<HTMLInputElement>('input[type=search]', content);
    const category = $<HTMLSelectElement>('select', content);
    const dueOnly = $<HTMLInputElement>('[data-due]', content);
    const grid = $('.deck__grid', content);
    const summary = $('.deck__summary', content);
    $('[data-study]', content).addEventListener('click', () => this.deps.openStudy());

    let seq = 0;
    const load = async (): Promise<void> => {
      const mine = ++seq;
      const filter: CardFilter = {};
      if (search.value.trim()) filter.q = search.value.trim();
      if (category.value) filter.category = category.value;
      if (dueOnly.checked) filter.due = '1';
      const cards = await api.cards(store.player.id, filter);
      if (mine !== seq) return;
      summary.textContent = `${cards.length} carta(s) — ${store.state.stats.cards} no total, ${store.state.stats.due} para revisar.`;
      grid.replaceChildren(...(cards.length
        ? cards.map((c) => this.cardEl(c))
        : [html(`<div class="deck__empty"><strong>Nenhuma carta aqui ainda.</strong>
            Clique nos lugares da cidade e converse com os NPCs: cada frase que você vê vira uma carta.</div>`)]));
    };

    let t: ReturnType<typeof setTimeout> | undefined;
    search.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 250); });
    category.addEventListener('change', load);
    dueOnly.addEventListener('change', load);
    this.deps.modal.open('🃏 Meu baralho', content);
    await load();
  }
}
