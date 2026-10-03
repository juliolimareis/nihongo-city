import type { Scenario } from '../content/scenario';
import type { Outcome } from './game-event';

/**
 * Expressões que viram cartas ao fim do evento: falas do NPC que o jogador viu,
 * respostas que ele acertou e, se falhou, a despedida do NPC.
 */
export function learnedExpressions(
  scenario: Scenario,
  seenStepIds: readonly number[],
  correctExpressionIds: readonly string[],
  outcome: Outcome,
): Set<string> {
  const learned = new Set<string>();
  for (const id of seenStepIds) {
    const step = scenario.step(id);
    if (step) learned.add(step.npcExpressionId);
  }
  correctExpressionIds.forEach((e) => learned.add(e));
  if (outcome === 'failed') learned.add(scenario.farewellExpressionId);
  return learned;
}
