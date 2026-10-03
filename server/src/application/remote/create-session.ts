import type { PairingDto } from '../../../../shared/contracts';
import type { PlayerRepository } from '../../domain/player/repositories';
import { RemoteSession } from '../../domain/remote/remote-session';
import type { PairingCodeGenerator, RemoteSessionRepository } from '../../domain/remote/repositories';
import type { Clock } from '../ports';
import { requirePlayer } from '../player/require-player';
import type { PairingInfoBuilder, RequestOrigin } from './pairing-info';

export class CreateRemoteSession {
  constructor(
    private readonly players: PlayerRepository,
    private readonly sessions: RemoteSessionRepository,
    private readonly codes: PairingCodeGenerator,
    private readonly pairing: PairingInfoBuilder,
    private readonly clock: Clock,
  ) {}

  execute(playerId: unknown, origin: RequestOrigin): Promise<PairingDto> {
    const player = requirePlayer(this.players, playerId);
    const code = this.codes.generate((c) => this.sessions.has(c));
    this.sessions.add(new RemoteSession(code, { id: player.id, name: player.name }, this.clock.now().getTime()));
    return this.pairing.build(code, origin);
  }
}
