import type { StatsDto } from '../../../../shared/contracts';
import type { Player } from './player';
import type { PlayerName } from './player-name';
import type { PlayerSettings, SettingsPatch } from './settings';

export interface PlayerRepository {
  findById(id: number): Player | null;
  findByName(name: PlayerName): Player | null;
  create(name: PlayerName): Player;
  save(player: Player): void;
}

export interface SettingsRepository {
  createDefaults(playerId: number): void;
  get(playerId: number): PlayerSettings;
  update(playerId: number, patch: SettingsPatch): void;
}

/** Read model: contadores do HUD. */
export interface PlayerStatsQuery {
  statsFor(playerId: number): StatsDto;
}
