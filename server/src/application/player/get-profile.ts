import type { ProfileDto } from '../../../../shared/contracts';
import type { PlayerRepository } from '../../domain/player/repositories';
import type { ProfileAssembler } from './profile-assembler';
import { requirePlayer } from './require-player';

export class GetProfile {
  constructor(private readonly players: PlayerRepository, private readonly profiles: ProfileAssembler) {}

  execute(playerId: unknown): ProfileDto {
    return this.profiles.build(requirePlayer(this.players, playerId));
  }
}
