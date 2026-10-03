import type { ProfileDto } from '../../../../shared/contracts';
import type { Player } from '../../domain/player/player';
import type { PlayerStatsQuery, SettingsRepository } from '../../domain/player/repositories';
import { toPlayerDto } from '../mappers';

export class ProfileAssembler {
  constructor(private readonly settings: SettingsRepository, private readonly stats: PlayerStatsQuery) {}

  build(player: Player): ProfileDto {
    return { player: toPlayerDto(player), settings: this.settings.get(player.id), stats: this.stats.statsFor(player.id) };
  }
}
