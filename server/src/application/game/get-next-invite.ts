import type { InviteDto } from '../../../../shared/contracts';
import type { NpcRepository, ScenarioRepository } from '../../domain/content/repositories';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError } from '../../domain/shared/errors';
import { toNpcDto } from '../mappers';
import { requirePlayer } from '../player/require-player';
import type { ScenarioSelector } from './scenario-selector';

/** Próximo convite para o toast de NPC; null quando não há nenhum liberado. */
export class GetNextInvite {
  constructor(
    private readonly players: PlayerRepository,
    private readonly scenarios: ScenarioRepository,
    private readonly npcs: NpcRepository,
    private readonly selector: ScenarioSelector,
  ) {}

  execute(playerId: unknown): InviteDto | null {
    const player = requirePlayer(this.players, playerId);
    const id = this.selector.select(player.id, this.scenarios.listInviteIds(player.level));
    const scenario = id ? this.scenarios.findById(id) : null;
    if (!scenario) return null;
    const npc = this.npcs.findById(scenario.npcId);
    if (!npc) throw new NotFoundError(`NPC ${scenario.npcId} não encontrado`);
    return {
      scenarioId: scenario.id, title: scenario.title,
      textPt: scenario.inviteTextPt, textJp: scenario.inviteTextJp,
      npc: toNpcDto(npc),
    };
  }
}
