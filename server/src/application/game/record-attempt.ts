import type { AttemptResponse } from '../../../../shared/contracts';
import type { ScenarioRepository } from '../../domain/content/repositories';
import { cleanTranscript } from '../../domain/event/attempt';
import type { AttemptRepository, GameEventRepository } from '../../domain/event/repositories';
import { ValidationError } from '../../domain/shared/errors';
import type { UnitOfWork } from '../ports';
import { requireOpenEvent } from './open-event';

export interface RecordAttemptInput {
  eventId: unknown;
  stepId?: unknown;
  optionId?: unknown;
  transcript?: unknown;
  similarity?: unknown;
}

export class RecordAttempt {
  constructor(
    private readonly events: GameEventRepository,
    private readonly attempts: AttemptRepository,
    private readonly scenarios: ScenarioRepository,
    private readonly uow: UnitOfWork,
  ) {}

  execute(input: RecordAttemptInput): AttemptResponse {
    const event = requireOpenEvent(this.events, input.eventId);
    const scenario = this.scenarios.findById(event.scenarioId);
    const step = scenario?.step(Number(input.stepId));
    if (!scenario || !step) throw new ValidationError('Passo inválido');
    const option = input.optionId ? scenario.option(step, Number(input.optionId)) ?? null : null;
    const correct = !!option?.correct;

    event.registerAttempt(correct);
    this.uow.run(() => {
      this.attempts.add({
        eventId: event.id, stepId: step.id, transcript: cleanTranscript(input.transcript),
        optionId: option?.id ?? null,
        similarity: typeof input.similarity === 'number' && Number.isFinite(input.similarity) ? input.similarity : null,
        correct,
      });
      this.events.save(event);
    });
    return { correct };
  }
}
