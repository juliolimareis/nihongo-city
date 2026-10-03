import type { Clock } from '../application/ports';
import type { RandomSource } from '../domain/shared/random';

export const systemClock: Clock = { now: () => new Date() };

export const mathRandom: RandomSource = { next: () => Math.random() };
