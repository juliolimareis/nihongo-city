// Comparação de respostas (voz ou digitadas) com as formas aceitas: lógica pura, sem DOM nem rede.

const PUNCT = /[\s、。，．,.!！?？…・「」『』（）()［］\[\]〜~"'`:;：；-]/g;

export const toHiragana = (s: string): string =>
  s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Normaliza para comparar: largura (NFKC), katakana→hiragana, sem pontuação/espaços, minúsculas. */
export function normalizeJp(s: unknown): string {
  return toHiragana(String(s ?? '').normalize('NFKC')).replace(PUNCT, '').toLowerCase();
}

/** Para português: sem acentos, sem pontuação, minúsculas, espaços simples. */
export function normalizePt(s: unknown): string {
  return String(s ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const sim = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  // Falou a frase inteira com algo a mais ("えーと…") ainda conta.
  if (b.length >= 3 && a.includes(b)) return Math.max(sim, 0.92);
  return sim;
}

/** Compara a tradução digitada com as traduções aceitas (separadas por "/"). */
export function matchTranslation(typed: string, pt: string): number {
  const answer = normalizePt(typed);
  if (!answer) return 0;
  const accepted = pt.split('/').map(normalizePt).filter(Boolean);
  accepted.push(normalizePt(pt));
  return Math.max(...accepted.map((a) => similarity(answer, a)));
}
