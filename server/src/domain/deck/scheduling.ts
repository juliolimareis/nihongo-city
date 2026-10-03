import type { Rating } from './rating';

export interface Schedule {
  readonly ease: number;
  readonly intervalDays: number;
  readonly repetitions: number;
  readonly lapses: number;
}

/** Estratégia de repetição espaçada (aberta para outras implementações, ex.: FSRS). */
export interface SchedulingPolicy {
  next(current: Schedule, rating: Rating): Schedule;
}

const MINUTE = 1 / (24 * 60);

/** SM-2 simplificado: errei zera; difícil cresce pouco; bom multiplica pelo ease; fácil multiplica mais. */
export class Sm2Scheduling implements SchedulingPolicy {
  next(current: Schedule, rating: Rating): Schedule {
    let { ease, intervalDays: interval, repetitions: reps, lapses } = current;
    switch (rating) {
      case 'again':
        ease = Math.max(1.3, ease - 0.2); interval = MINUTE; reps = 0; lapses += 1; break;
      case 'hard':
        ease = Math.max(1.3, ease - 0.15); interval = Math.max(1, interval * 1.2); reps += 1; break;
      case 'good':
        interval = reps === 0 ? 1 : reps === 1 ? 3 : interval * ease; reps += 1; break;
      case 'easy':
        interval = reps === 0 ? 3 : interval * ease * 1.3; ease += 0.15; reps += 1; break;
    }
    return { ease, intervalDays: Math.round(interval * 1000) / 1000, repetitions: reps, lapses };
  }
}
