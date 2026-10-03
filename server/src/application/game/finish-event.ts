import type { ExpressionDto, FinishEventResponse } from '../../../../shared/contracts';
import type { ExpressionRepository, ScenarioRepository } from '../../domain/content/repositories';
import type { CardRepository } from '../../domain/deck/repositories';
import { parseOutcome } from '../../domain/event/game-event';
import { learnedExpressions } from '../../domain/event/learning';
import type { AttemptRepository, GameEventRepository } from '../../domain/event/repositories';
import type { XpPolicy } from '../../domain/event/xp-policy';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError } from '../../domain/shared/errors';
import { toExpressionDto } from '../mappers';
import type { Clock, UnitOfWork } from '../ports';
import { requireOpenEvent } from './open-event';

export interface FinishEventInput {
  eventId: unknown;
  outcome?: unknown;
  seenStepIds?: unknown;
}

/** Encerra o evento: novas cartas no baralho, XP e nível. */
export class FinishEvent {
  constructor(
    private readonly events: GameEventRepository,
    private readonly attempts: AttemptRepository,
    private readonly scenarios: ScenarioRepository,
    private readonly expressions: ExpressionRepository,
    private readonly cards: CardRepository,
    private readonly players: PlayerRepository,
    private readonly xpPolicy: XpPolicy,
    private readonly clock: Clock,
    private readonly uow: UnitOfWork,
  ) {}

  execute(input: FinishEventInput): FinishEventResponse {
    const event = requireOpenEvent(this.events, input.eventId);
    const outcome = parseOutcome(input.outcome);
    const seenStepIds = (Array.isArray(input.seenStepIds) ? input.seenStepIds : []).map(Number);
    const scenario = this.scenarios.findById(event.scenarioId);
    const player = this.players.findById(event.playerId);
    if (!scenario || !player) throw new NotFoundError('Evento não encontrado ou já encerrado');

    return this.uow.run(() => {
      const correctExpressions = [...new Set(this.attempts.correctOptionIds(event.id)
        .map((id) => scenario.optionById(id)?.expressionId)
        .filter((e): e is string => !!e))];
      const learned = [...learnedExpressions(scenario, seenStepIds, correctExpressions, outcome)];
      const exprs = this.expressions.findByIds(learned);
      const newCards: ExpressionDto[] = [];
      for (const id of learned) {
        const expr = exprs.get(id);
        if (expr && this.cards.addIfMissing(player.id, id)) newCards.push(toExpressionDto(expr));
      }

      const xpGain = this.xpPolicy.xpFor(outcome, correctExpressions.length);
      event.finish(outcome, this.clock.now());
      player.gainXp(xpGain);
      this.events.save(event);
      this.players.save(player);
      return { xpGain, xp: player.xp, level: player.level, newCards };
    });
  }
}
