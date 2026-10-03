export const XP_PER_LEVEL = 100;

/** Fração do nível atual já percorrida (0–1). */
export const levelProgress = (xp: number): number => (xp % XP_PER_LEVEL) / XP_PER_LEVEL;

/** Data do SQLite ("AAAA-MM-DD HH:MM:SS", UTC) → Date. */
export const parseServerDate = (s: string): Date => new Date(s.replace(' ', 'T') + 'Z');

export const isDue = (dueAt: string, now = new Date()): boolean => parseServerDate(dueAt) <= now;

export function relativeDue(dueAt: string, now = Date.now()): string {
  const diffH = (parseServerDate(dueAt).getTime() - now) / 3.6e6;
  if (diffH <= 0) return 'para revisar agora';
  if (diffH < 24) return `revisar em ${Math.ceil(diffH)} h`;
  return `revisar em ${Math.round(diffH / 24)} dia(s)`;
}

/** Fisher-Yates. */
export function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
