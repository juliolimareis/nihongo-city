import type { ProfileDto } from '../../../../shared/contracts';
import type { Player } from '../../domain/player/player';
import type { PlayerStatsQuery, SettingsRepository } from '../../domain/player/repositories';
import type { StudyDay } from '../deck/study-day';
import { toPlayerDto } from '../mappers';

export class ProfileAssembler {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly stats: PlayerStatsQuery,
    private readonly studyDay: StudyDay,
  ) {}

  build(player: Player): ProfileDto {
    const stats = { ...this.stats.statsFor(player.id), dueToday: this.studyDay.summary(player.id).available };
    return { player: toPlayerDto(player), settings: this.settings.get(player.id), stats };
  }
}
