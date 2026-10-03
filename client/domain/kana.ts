// Tabelas e transformações de kana usadas pelo teclado de estudo.

/** Tabela gojūon em colunas (あ, か, さ…), 5 linhas cada; '' = espaço vazio. */
export const GOJUON_COLUMNS: ReadonlyArray<string | readonly string[]> = [
  'あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの',
  'はひふへほ', 'まみむめも', ['や', '', 'ゆ', '', 'よ'], 'らりるれろ', ['わ', '', 'を', '', 'ん'],
];

/** ゛/゜: cada toque avança no ciclo (は → ば → ぱ → は). */
export const DAKUTEN_CYCLES: readonly string[] = [
  'かが', 'きぎ', 'くぐ', 'けげ', 'こご', 'さざ', 'しじ', 'すず', 'せぜ', 'そぞ',
  'ただ', 'ちぢ', 'つづ', 'てで', 'とど', 'はばぱ', 'ひびぴ', 'ふぶぷ', 'へべぺ', 'ほぼぽ', 'うゔ',
];

export const SMALL_PAIRS: readonly string[] = ['あぁ', 'いぃ', 'うぅ', 'えぇ', 'おぉ', 'やゃ', 'ゆゅ', 'よょ', 'つっ', 'わゎ'];

export const toKatakana = (s: string): string => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const toHiragana = (s: string): string => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Próxima forma do caractere no ciclo (mantém katakana/hiragana); null se não houver ciclo. */
export function cycleKana(ch: string, groups: readonly string[]): string | null {
  const h = toHiragana(ch);
  const isKata = h !== ch;
  for (const g of groups) {
    const chars = [...g];
    const i = chars.indexOf(h);
    if (i >= 0) {
      const next = chars[(i + 1) % chars.length];
      return isKata ? toKatakana(next) : next;
    }
  }
  return null;
}

/** Aplica o ciclo ao último caractere do texto. */
export function cycleLast(value: string, groups: readonly string[]): string {
  if (!value) return value;
  const chars = [...value];
  const next = cycleKana(chars[chars.length - 1], groups);
  if (!next) return value;
  chars[chars.length - 1] = next;
  return chars.join('');
}
