const DIGITS = '〇一二三四五六七八九';
const UNITS: ReadonlyArray<readonly [number, string]> = [[1e8, '億'], [1e4, '万'], [1000, '千'], [100, '百'], [10, '十']];

export function numberToKanji(n: number): string {
  if (n === 0) return '〇';
  let out = '';
  for (const [value, unit] of UNITS) {
    const q = Math.floor(n / value);
    if (!q) continue;
    out += (value >= 1e4 ? numberToKanji(q) : q === 1 ? '' : DIGITS[q]) + unit;
    n %= value;
  }
  return out + (n ? DIGITS[n] : '');
}

export const katakanaToHiragana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Prepara um texto para leitura: largura normalizada (NFKC) e números arábicos em kanji. */
export const normalizeForReading = (text: string): string =>
  text.normalize('NFKC').replace(/\d+/g, (d) => (d.length <= 9 ? numberToKanji(Number(d)) : d));
