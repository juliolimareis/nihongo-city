import type { CardDto, CardFilter } from '../../../../shared/contracts';
import type { CardQuery } from '../../domain/deck/repositories';
import type { PlayerRepository } from '../../domain/player/repositories';
import { requirePlayer } from '../player/require-player';

export interface ListCardsInput {
  player: unknown;
  q?: unknown;
  category?: unknown;
  due?: unknown;
}

export class ListCards {
  constructor(private readonly players: PlayerRepository, private readonly cards: CardQuery) {}

  execute(input: ListCardsInput): CardDto[] {
    const { id } = requirePlayer(this.players, input.player);
    const filter: CardFilter = {};
    if (input.category) filter.category = String(input.category);
    if (input.due === '1') filter.due = '1';
    if (input.q) filter.q = String(input.q);
    return this.cards.list(id, filter);
  }
}
