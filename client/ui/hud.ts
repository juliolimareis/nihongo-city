import type { Store } from '../application/store';
import { levelProgress } from '../domain/progress';
import { $ } from './dom';

/** Nome, nível, barra de XP e contadores do baralho. */
export function renderHud(store: Store): void {
  const p = store.player;
  const { stats } = store.state;
  $('#hud-name').textContent = p.name;
  $('#hud-level').textContent = String(p.level);
  $('#hud-xp').style.width = `${levelProgress(p.xp) * 100}%`;
  ($('#hud-level').parentElement as HTMLElement).title = `Nível ${p.level} · ${p.xp} XP`;
  $('#badge-cards').textContent = stats.cards ? String(stats.cards) : '';
  $('#badge-due').textContent = stats.due ? String(stats.due) : '';
}
