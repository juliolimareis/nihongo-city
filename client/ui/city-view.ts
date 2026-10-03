import type { LocationDto, SceneDto } from '../../shared/contracts';
import type { AudioPort } from '../application/ports';
import type { SettingsService } from '../application/settings-service';
import type { Store } from '../application/store';
import { $, esc, html, sleep } from './dom';
import type { Modal } from './modal';

export interface CityDeps {
  store: Store;
  settings: SettingsService;
  audio: Pick<AudioPort, 'sfx'>;
  modal: Modal;
}

const DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
};

/** Cena estática com hotspots clicáveis, troca de cena e lista de locais. */
export class CityView {
  private onSelectLocation: (loc: LocationDto) => void = () => {};
  private sceneIndex = 0;

  constructor(private readonly deps: CityDeps) {}

  private get scenes(): SceneDto[] { return this.deps.store.state.scenes; }

  async init({ onSelect }: { onSelect: (loc: LocationDto) => void }): Promise<void> {
    this.onSelectLocation = onSelect;
    const saved = this.scenes.findIndex((s) => s.id === this.deps.store.settings.current_scene);
    await this.renderScene(Math.max(0, saved), { animate: false });
    $('#scene-prev').addEventListener('click', () => this.switchScene(-1));
    $('#scene-next').addEventListener('click', () => this.switchScene(1));
    $('#btn-places').addEventListener('click', () => this.openPlaces());
    document.addEventListener('keydown', (e) => this.spatialNav(e));
    let lastPortrait = matchMedia('(orientation: portrait)').matches;
    addEventListener('resize', () => {
      const portrait = matchMedia('(orientation: portrait)').matches;
      if (portrait !== lastPortrait) { lastPortrait = portrait; requestAnimationFrame(() => this.centerPortraitScroll()); }
    });
  }

  switchScene(delta: number): Promise<void> {
    const next = (this.sceneIndex + delta + this.scenes.length) % this.scenes.length;
    this.deps.settings.save({ current_scene: this.scenes[next].id });
    return this.renderScene(next);
  }

  async goToScene(sceneId: string): Promise<void> {
    const i = this.scenes.findIndex((s) => s.id === sceneId);
    if (i >= 0 && i !== this.sceneIndex) {
      this.deps.settings.save({ current_scene: sceneId });
      await this.renderScene(i);
    }
  }

  openPlaces(): void {
    const content = html('<div class="places"></div>');
    for (const scene of this.scenes) {
      const section = html(`<section><h3>${esc(scene.nameJp)} · ${esc(scene.namePt)}</h3><div class="places__grid"></div></section>`);
      for (const loc of scene.locations) {
        const btn = html(`
          <button type="button" class="place-btn">
            <span class="place-btn__icon">${esc(loc.icon)}</span>
            <span><span class="jp">${esc(loc.nameJp)}</span><small>${esc(loc.namePt)}</small></span>
          </button>`);
        btn.addEventListener('click', async () => {
          this.deps.modal.close(true);
          await this.goToScene(scene.id);
          this.onSelectLocation(loc);
        });
        $('.places__grid', section).append(btn);
      }
      content.append(section);
    }
    this.deps.modal.open('📍 Locais da cidade', content);
  }

  private hotspotEl(loc: LocationDto): HTMLElement {
    const side = loc.x < 50 ? 'is-left' : 'is-right';
    const btn = html(`
      <button type="button" class="hotspot hotspot--${esc(loc.kind)} ${loc.kind === 'signpost' ? side : ''}"
        data-id="${esc(loc.id)}" aria-label="${esc(`${loc.namePt} (${loc.nameJp})`)}">
        <span class="pin">
          <span class="pin__icon"><span>${esc(loc.icon)}</span></span>
          <span class="pin__plate">${esc(loc.icon)} ${esc(loc.nameJp)}<small>${esc(loc.namePt)}</small></span>
        </span>
      </button>`);
    Object.assign(btn.style, { left: `${loc.x}%`, top: `${loc.y}%`, width: `${loc.w}%`, height: `${loc.h}%` });
    btn.addEventListener('click', () => {
      this.deps.audio.sfx('click');
      this.onSelectLocation(loc);
    });
    return btn;
  }

  private centerPortraitScroll(): void {
    const vp = $('#viewport');
    if (vp.scrollWidth > vp.clientWidth) {
      vp.style.scrollBehavior = 'auto';
      vp.scrollLeft = (vp.scrollWidth - vp.clientWidth) / 2;
      vp.style.scrollBehavior = '';
    }
  }

  private async renderScene(index: number, { animate = true } = {}): Promise<void> {
    this.sceneIndex = (index + this.scenes.length) % this.scenes.length;
    const scene = this.scenes[this.sceneIndex];
    const city = $('#city');
    const img = $<HTMLImageElement>('#city-img');

    if (animate) {
      city.classList.add('is-switching');
      await sleep(400);
    }
    city.style.setProperty('--ratio', String(scene.width / scene.height));
    img.src = scene.image;
    img.alt = `${scene.namePt} — ${scene.nameJp}`;
    try { await img.decode(); } catch { /* imagem ainda carregando */ }
    $('#hotspots').replaceChildren(...scene.locations.map((l) => this.hotspotEl(l)));
    $('#scene-jp').textContent = scene.nameJp;
    $('#scene-pt').textContent = scene.namePt;
    this.centerPortraitScroll();
    city.classList.remove('is-switching');
  }

  /** Setas movem o foco para o hotspot mais próximo naquela direção (TV / controle remoto). */
  private spatialNav(e: KeyboardEvent): void {
    const dir = DIRECTIONS[e.key];
    const { eventOpen, modalOpen } = this.deps.store.state;
    if (!dir || eventOpen || modalOpen) return;
    const spots = Array.from(document.querySelectorAll<HTMLElement>('.hotspot'));
    if (!spots.length) return;
    const active = document.activeElement as HTMLElement | null;
    const cur = active?.classList.contains('hotspot') ? active : null;
    e.preventDefault();
    if (!cur) { spots[0].focus(); return; }
    const c = cur.getBoundingClientRect();
    const cx = c.left + c.width / 2, cy = c.top + c.height / 2;
    let best: HTMLElement | null = null, bestScore = Infinity;
    for (const s of spots) {
      if (s === cur) continue;
      const r = s.getBoundingClientRect();
      const dx = r.left + r.width / 2 - cx, dy = r.top + r.height / 2 - cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 0) continue;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const score = along + across * 2;
      if (score < bestScore) { bestScore = score; best = s; }
    }
    best?.focus();
    best?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }
}
