import type { Rating } from './rating';
import type { Schedule, SchedulingPolicy } from './scheduling';

export interface CardProps extends Schedule {
  playerId: number;
  expressionId: string;
  dueAt: Date;
}

/** Uma expressão no baralho de um jogador, com o estado da repetição espaçada. */
export class Card {
  private constructor(private props: CardProps) {}

  static restore(props: CardProps): Card {
    return new Card({ ...props });
  }

  get playerId(): number { return this.props.playerId; }
  get expressionId(): string { return this.props.expressionId; }

  review(rating: Rating, policy: SchedulingPolicy, now: Date): void {
    const next = policy.next(this.props, rating);
    const dueAt = new Date(now.getTime() + Math.round(next.intervalDays * 86400) * 1000);
    this.props = { ...this.props, ...next, dueAt };
  }

  snapshot(): Readonly<CardProps> {
    return { ...this.props };
  }
}
