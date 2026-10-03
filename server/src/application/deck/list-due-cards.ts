import type { CardDto } from '../../../../shared/contracts';
import type { CardQuery } from '../../domain/deck/repositories';
import type { PlayerRepository } from '../../domain/player/repositories';
import { requirePlayer } from '../player/require-player';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ListDueCards {
  constructor(private readonly players: PlayerRepository, private readonly cards: CardQuery) {}

  execute(playerId: unknown, rawLimit: unknown): CardDto[] {
    const { id } = requirePlayer(this.players, playerId);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(rawLimit) || DEFAULT_LIMIT));
    return this.cards.due(id, limit);
  }
}
