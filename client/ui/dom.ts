// Utilitários de DOM compartilhados pela TV e pelo celular.

/** querySelector que falha alto: os ids usados existem no HTML estático. */
export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel);
  if (!el) throw new Error(`Elemento não encontrado: ${sel}`);
  return el;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown): string => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Cria um elemento a partir de HTML (o chamador é responsável por escapar dados). */
export function html<T extends HTMLElement = HTMLElement>(markup: string): T {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as T;
}

// Silhueta 9:16 usada quando a imagem do NPC ainda não existe.
export const NPC_FALLBACK = 'data:image/svg+xml,' + encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 1600">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#9b6bff"/><stop offset="1" stop-color="#3ef2ff"/></linearGradient></defs>
  <g fill="url(#g)" opacity="0.85">
    <circle cx="450" cy="420" r="190"/>
    <path d="M140 1600 C140 980 260 700 450 700 C640 700 760 980 760 1600 Z"/>
  </g>
</svg>`);

export function npcImage(img: HTMLImageElement, src: string): void {
  img.onerror = () => { img.onerror = null; img.src = NPC_FALLBACK; };
  img.src = src;
}

/** Animação "+1 carta" saindo do ponto indicado em direção ao botão do baralho. */
export function floatGain(text: string, fromEl?: Element | null): void {
  const r = (fromEl || $('#btn-deck')).getBoundingClientRect();
  const el = html(`<div class="float-gain">${esc(text)}</div>`);
  el.style.left = `${r.left + r.width / 2}px`;
  el.style.top = `${r.top}px`;
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove());
}

export function bump(el: HTMLElement): void {
  el.classList.remove('is-bump');
  void el.offsetWidth;
  el.classList.add('is-bump');
}

/** Espera clique no elemento ou Enter/Espaço (fora de botões e campos). */
export function waitAdvance(el: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as Element | null;
      if ((e.key === 'Enter' || e.key === ' ') && !target?.closest('button, input, select, textarea')) {
        e.preventDefault();
        finish();
      }
    };
    const finish = (): void => {
      el.removeEventListener('click', finish);
      document.removeEventListener('keydown', onKey);
      resolve();
    };
    el.addEventListener('click', finish);
    document.addEventListener('keydown', onKey);
  });
}
