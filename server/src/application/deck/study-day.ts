import type { DueCardsResponse, StudyDayDto } from '../../../../shared/contracts';
import { allowedToday, remainingToday, startOfDay, type DueCount, type DueStage } from '../../domain/deck/daily-limit';
import type { CardQuery } from '../../domain/deck/repositories';
import type { SettingsRepository } from '../../domain/player/repositories';
import type { Clock } from '../ports';

/** Ordem da fila: primeiro o que errou hoje, depois as revisões, por último as cartas novas. */
const STAGES: readonly DueStage[] = ['learning', 'review', 'new'];

/** Aplica o limite diário do jogador (configurações) às cartas vencidas. */
export class StudyDay {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly cards: CardQuery,
    private readonly clock: Clock,
  ) {}

  summary(playerId: number): StudyDayDto {
    return this.plan(playerId).today;
  }

  /** Próximas cartas a estudar, até `limit` por sessão. */
  queue(playerId: number, limit: number): DueCardsResponse {
    const { today, allowed, dayStart } = this.plan(playerId);
    const cards = STAGES.flatMap((stage) => this.cards.dueByStage(playerId, stage, dayStart, allowed[stage]));
    return { cards: cards.slice(0, limit), today };
  }

  private plan(playerId: number): { today: StudyDayDto; allowed: DueCount; dayStart: Date } {
    const { daily_new_cards: newLimit, daily_reviews: reviewsLimit } = this.settings.get(playerId);
    const dayStart = startOfDay(this.clock.now());
    const done = this.cards.studiedSince(playerId, dayStart);
    const due = this.cards.countDue(playerId, dayStart);
    const allowed = allowedToday(due, remainingToday({ newCards: newLimit, reviews: reviewsLimit }, done));
    const count = (c: DueCount): number => c.learning + c.review + c.new;
    const today: StudyDayDto = {
      newDone: done.newCards, newLimit, reviewsDone: done.reviews, reviewsLimit,
      available: count(allowed), held: count(due) - count(allowed),
    };
    return { today, allowed, dayStart };
  }
}
