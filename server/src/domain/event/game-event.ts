import type { EventSource, Outcome } from '../../../../shared/contracts';

export type { EventSource, Outcome };

const OUTCOMES: readonly Outcome[] = ['success', 'failed', 'abandoned'];

/** Resultado desconhecido conta como abandono. */
export const parseOutcome = (value: unknown): Outcome =>
  (OUTCOMES.includes(value as Outcome) ? value : 'abandoned') as Outcome;

export const parseEventSource = (value: unknown): EventSource => (value === 'invite' ? 'invite' : 'click');

export interface GameEventProps {
  id: number;
  playerId: number;
  scenarioId: string;
  mistakes: number;
  outcome: Outcome | null;
  finishedAt: Date | null;
}

/** Agregado: uma partida de um cenário, do início ao encerramento. */
export class GameEvent {
  private constructor(private props: GameEventProps) {}

  static restore(props: GameEventProps): GameEvent {
    return new GameEvent({ ...props });
  }

  get id(): number { return this.props.id; }
  get playerId(): number { return this.props.playerId; }
  get scenarioId(): string { return this.props.scenarioId; }
  get isOpen(): boolean { return this.props.finishedAt === null; }

  registerAttempt(correct: boolean): void {
    if (!correct) this.props = { ...this.props, mistakes: this.props.mistakes + 1 };
  }

  finish(outcome: Outcome, now: Date): void {
    this.props = { ...this.props, outcome, finishedAt: now };
  }

  snapshot(): Readonly<GameEventProps> {
    return { ...this.props };
  }
}
