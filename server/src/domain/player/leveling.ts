export const XP_PER_LEVEL = 100;

export const levelForXp = (xp: number): number => 1 + Math.floor(xp / XP_PER_LEVEL);
