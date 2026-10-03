import type { ExpressionDto, ScenarioDto } from '../../../../shared/contracts';
import type { ExpressionRepository, NpcRepository } from '../../domain/content/repositories';
import type { Scenario } from '../../domain/content/scenario';
import { NotFoundError } from '../../domain/shared/errors';
import { type RandomSource, shuffle } from '../../domain/shared/random';
import { toExpressionDto, toNpcDto } from '../mappers';

/** Monta o roteiro enviado ao navegador, com as opções embaralhadas. */
export class ScenarioAssembler {
  constructor(
    private readonly expressions: ExpressionRepository,
    private readonly npcs: NpcRepository,
    private readonly random: RandomSource,
  ) {}

  build(scenario: Scenario): ScenarioDto {
    const npc = this.npcs.findById(scenario.npcId);
    if (!npc) throw new NotFoundError(`NPC ${scenario.npcId} não encontrado`);
    const exprs = this.expressions.findByIds(scenario.expressionIds());
    const expr = (id: string): ExpressionDto => {
      const e = exprs.get(id);
      if (!e) throw new NotFoundError(`Expressão ${id} não encontrada`);
      return toExpressionDto(e);
    };
    return {
      id: scenario.id, kind: scenario.kind, title: scenario.title, culture: scenario.cultureNote,
      npc: toNpcDto(npc),
      farewell: expr(scenario.farewellExpressionId),
      steps: scenario.steps.map((st) => ({
        id: st.id, key: st.key, prompt: st.prompt,
        npc: expr(st.npcExpressionId),
        options: shuffle(st.options.map((o) => ({
          id: o.id, correct: o.correct, feedback: o.feedback, next: o.nextStepKey,
          expr: expr(o.expressionId),
        })), this.random),
      })),
    };
  }
}
