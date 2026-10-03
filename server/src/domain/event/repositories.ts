import type { Attempt } from './attempt';
import type { EventSource, GameEvent } from './game-event';

export interface GameEventRepository {
  /** Registra o início de um evento e devolve o id. */
  start(playerId: number, scenarioId: string, source: EventSource): number;
  findOpen(id: number): GameEvent | null;
  save(event: GameEvent): void;
  lastScenarioId(playerId: number): string | null;
  playCount(playerId: number, scenarioId: string): number;
  deleteAllFor(playerId: number): void;
}

export interface AttemptRepository {
  add(attempt: Attempt): void;
  /** Opções acertadas no evento, na ordem das tentativas. */
  correctOptionIds(eventId: number): number[];
}
