import type { Outcome } from './game-event';

export interface XpPolicy {
  xpFor(outcome: Outcome, correctAnswers: number): number;
}

const XP_SUCCESS = 20;
const XP_PER_CORRECT = 5;
const XP_FAILED = 5;

export class DefaultXpPolicy implements XpPolicy {
  xpFor(outcome: Outcome, correctAnswers: number): number {
    if (outcome === 'success') return XP_SUCCESS + XP_PER_CORRECT * correctAnswers;
    return outcome === 'failed' ? XP_FAILED : 0;
  }
}
