import type { RandomSource } from '../shared/random';

/**
 * Escolhe o próximo cenário: evita repetir o último e prioriza os menos jogados,
 * sorteando entre os empatados.
 */
export function pickScenario(
  candidates: readonly string[],
  lastPlayed: string | null,
  playCount: (scenarioId: string) => number,
  random: RandomSource,
): string | null {
  if (!candidates.length) return null;
  let pool = candidates.filter((c) => c !== lastPlayed);
  if (!pool.length) pool = [...candidates];
  const scored = pool.map((id) => ({ id, n: playCount(id) }));
  const min = Math.min(...scored.map((x) => x.n));
  const best = scored.filter((x) => x.n === min);
  return best[Math.floor(random.next() * best.length)].id;
}
