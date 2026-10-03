/** Fonte de aleatoriedade injetável (testes podem fixar a sequência). */
export interface RandomSource {
  /** Número em [0, 1). */
  next(): number;
}

/** Fisher-Yates: todas as ordens com a mesma chance (sort(random) seria enviesado). */
export function shuffle<T>(items: T[], random: RandomSource): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random.next() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
