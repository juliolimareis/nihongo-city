import type { AudioPort } from '../application/ports';
import { DAKUTEN_CYCLES, GOJUON_COLUMNS, SMALL_PAIRS, cycleLast, toKatakana } from '../domain/kana';
import { $, html } from './dom';

export interface KanaKeyboard {
  readonly el: HTMLElement;
  readonly value: string;
  clear(): void;
}

/** Teclado de kana na tela (a TV não tem teclado japonês). */
export function createKanaKeyboard(audio: Pick<AudioPort, 'sfx'>, { onChange }: { onChange: (value: string) => void }): KanaKeyboard {
  let value = '';
  let katakana = false;

  const el = html(`
    <div class="kana-kb">
      <div class="kana-kb__tabs" role="tablist">
        <button type="button" class="mode-btn" data-tab="hira" role="tab" aria-pressed="true">ひらがな</button>
        <button type="button" class="mode-btn" data-tab="kata" role="tab" aria-pressed="false">カタカナ</button>
      </div>
      <div class="kana-kb__grid"></div>
      <div class="kana-kb__mods">
        <button type="button" class="kana-key kana-key--mod" data-mod="dakuten" aria-label="Dakuten / handakuten">゛゜</button>
        <button type="button" class="kana-key kana-key--mod" data-mod="small" aria-label="Letra pequena">小</button>
        <button type="button" class="kana-key kana-key--mod" data-char="ー" aria-label="Prolongar">ー</button>
        <button type="button" class="kana-key kana-key--mod" data-char="、">、</button>
        <button type="button" class="kana-key kana-key--mod" data-mod="back" aria-label="Apagar">⌫</button>
        <button type="button" class="kana-key kana-key--mod" data-mod="clear" aria-label="Limpar">🗑</button>
      </div>
    </div>`);
  const grid = $('.kana-kb__grid', el);

  function renderGrid(): void {
    grid.replaceChildren(...GOJUON_COLUMNS.flatMap((col) => [...col].map((ch) => {
      if (!ch) return html('<span class="kana-key kana-key--blank" aria-hidden="true"></span>');
      const c = katakana ? toKatakana(ch) : ch;
      return html(`<button type="button" class="kana-key" data-char="${c}" lang="ja">${c}</button>`);
    })));
  }

  function set(v: string): void {
    value = v;
    onChange(value);
  }

  el.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest<HTMLButtonElement>('button');
    if (!btn) return;
    audio.sfx('click');
    const { tab, char, mod } = btn.dataset;
    if (tab) {
      katakana = tab === 'kata';
      el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      renderGrid();
    } else if (char) set(value + char);
    else if (mod === 'dakuten') set(cycleLast(value, DAKUTEN_CYCLES));
    else if (mod === 'small') set(cycleLast(value, SMALL_PAIRS));
    else if (mod === 'back') set([...value].slice(0, -1).join(''));
    else if (mod === 'clear') set('');
  });

  renderGrid();
  return { el, get value() { return value; }, clear: () => set('') };
}
