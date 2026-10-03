import type { GameEventRepository } from '../../domain/event/repositories';
import { pickScenario } from '../../domain/event/scenario-picker';
import type { RandomSource } from '../../domain/shared/random';

/** Aplica a regra de escolha de cenário com o histórico do jogador. */
export class ScenarioSelector {
  constructor(private readonly events: GameEventRepository, private readonly random: RandomSource) {}

  select(playerId: number, candidates: readonly string[]): string | null {
    return pickScenario(
      candidates,
      this.events.lastScenarioId(playerId),
      (scenarioId) => this.events.playCount(playerId, scenarioId),
      this.random,
    );
  }
}
