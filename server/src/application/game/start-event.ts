import type { StartEventResponse } from '../../../../shared/contracts';
import type { LocationRepository, ScenarioRepository } from '../../domain/content/repositories';
import { isStreet } from '../../domain/content/scene';
import { parseEventSource } from '../../domain/event/game-event';
import type { GameEventRepository } from '../../domain/event/repositories';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError } from '../../domain/shared/errors';
import { requirePlayer } from '../player/require-player';
import type { ScenarioAssembler } from './scenario-assembler';
import type { ScenarioSelector } from './scenario-selector';

export interface StartEventInput {
  player: unknown;
  scenarioId?: unknown;
  locationId?: unknown;
  source?: unknown;
}

/** Abre um evento: um cenário pedido (convite) ou sorteado entre os do local clicado. */
export class StartEvent {
  constructor(
    private readonly players: PlayerRepository,
    private readonly locations: LocationRepository,
    private readonly scenarios: ScenarioRepository,
    private readonly events: GameEventRepository,
    private readonly selector: ScenarioSelector,
    private readonly assembler: ScenarioAssembler,
  ) {}

  execute(input: StartEventInput): StartEventResponse {
    const player = requirePlayer(this.players, input.player);
    const source = parseEventSource(input.source);
    const scenarioId = input.scenarioId ? String(input.scenarioId) : this.chooseForLocation(player.id, player.level, input.locationId);
    const scenario = scenarioId ? this.scenarios.findById(scenarioId) : null;
    if (!scenario) throw new NotFoundError('Nenhum evento disponível aqui ainda');

    const eventId = this.events.start(player.id, scenario.id, source);
    return { eventId, scenario: this.assembler.build(scenario) };
  }

  private chooseForLocation(playerId: number, level: number, locationId: unknown): string | null {
    const location = this.locations.findById(String(locationId ?? ''));
    if (!location) throw new NotFoundError('Local não encontrado');
    const candidates = isStreet(location)
      ? this.scenarios.listInviteIds(level)
      : this.scenarios.listIdsForLocation(location.id, level);
    return this.selector.select(playerId, candidates);
  }
}
