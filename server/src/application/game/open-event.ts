import type { GameEvent } from '../../domain/event/game-event';
import type { GameEventRepository } from '../../domain/event/repositories';
import { NotFoundError } from '../../domain/shared/errors';

export function requireOpenEvent(events: GameEventRepository, rawId: unknown): GameEvent {
  const event = events.findOpen(Number(rawId));
  if (!event) throw new NotFoundError('Evento não encontrado ou já encerrado');
  return event;
}
