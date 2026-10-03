import { $, html } from './dom';

/** Modo ?edit=1: arraste sobre a foto para desenhar um retângulo e copiar as coordenadas em %. */
export function initHotspotEditor(): void {
  const city = $('#city');
  document.body.classList.add('editor');
  const layer = html('<div class="editor__layer" title="Arraste para marcar um local"></div>');
  const panel = html(`
    <div class="editor__panel">
      <strong>Editor de hotspots</strong> — arraste sobre a foto. Cole o resultado em <code>server/seed/locations.json</code>
      e rode <code>npm run seed</code>.
      <pre>—</pre>
      <button type="button" class="btn btn--small">Copiar</button>
    </div>`);
  city.append(layer);
  document.body.append(panel);
  const out = $('pre', panel);
  $('button', panel).addEventListener('click', () => { void navigator.clipboard?.writeText(out.textContent || ''); });

  let start: { x: number; y: number } | null = null;
  let box: HTMLElement | null = null;
  const pct = (e: PointerEvent): { x: number; y: number } => {
    const r = city.getBoundingClientRect();
    return {
      x: Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100)),
    };
  };
  const round = (n: number): number => Math.round(n * 10) / 10;

  layer.addEventListener('pointerdown', (e) => {
    layer.setPointerCapture(e.pointerId);
    start = pct(e);
    box?.remove();
    box = html('<div class="editor__draw"></div>');
    city.append(box);
  });
  layer.addEventListener('pointermove', (e) => {
    if (!start || !box) return;
    const p = pct(e);
    const x = Math.min(start.x, p.x), y = Math.min(start.y, p.y);
    const w = Math.abs(p.x - start.x), h = Math.abs(p.y - start.y);
    Object.assign(box.style, { left: `${x}%`, top: `${y}%`, width: `${w}%`, height: `${h}%` });
    out.textContent = `"x": ${round(x)}, "y": ${round(y)}, "w": ${round(w)}, "h": ${round(h)}`;
  });
  layer.addEventListener('pointerup', () => { start = null; });
}
