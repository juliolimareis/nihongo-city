import type { CardDto } from '../../../../shared/contracts';
import { parseRating, parseStudyMode } from '../../domain/deck/rating';
import type { CardQuery, CardRepository, ReviewLogRepository } from '../../domain/deck/repositories';
import type { SchedulingPolicy } from '../../domain/deck/scheduling';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError } from '../../domain/shared/errors';
import type { Clock, UnitOfWork } from '../ports';
import { requirePlayer } from '../player/require-player';

export interface ReviewCardInput {
  player: unknown;
  expressionId: string;
  mode: unknown;
  rating: unknown;
}

export class ReviewCard {
  constructor(
    private readonly players: PlayerRepository,
    private readonly cards: CardRepository,
    private readonly reviews: ReviewLogRepository,
    private readonly cardQuery: CardQuery,
    private readonly scheduling: SchedulingPolicy,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(input: ReviewCardInput): CardDto {
    const { id: playerId } = requirePlayer(this.players, input.player);
    const rating = parseRating(input.rating);
    const mode = parseStudyMode(input.mode);
    const card = this.cards.find(playerId, input.expressionId);
    if (!card) throw new NotFoundError('Carta não está no baralho');

    card.review(rating, this.scheduling, this.clock.now());
    this.uow.run(() => {
      this.cards.save(card);
      this.reviews.append({ playerId, expressionId: card.expressionId, mode, rating });
    });
    const view = this.cardQuery.one(playerId, card.expressionId);
    if (!view) throw new NotFoundError('Carta não está no baralho');
    return view;
  }
}
