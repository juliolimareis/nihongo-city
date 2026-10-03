import type { SettingsDto } from '../../../../shared/contracts';
import type { SceneRepository } from '../../domain/content/repositories';
import type { PlayerRepository, SettingsRepository } from '../../domain/player/repositories';
import { sanitizeSettings } from '../../domain/player/settings';
import { requirePlayer } from './require-player';

export class UpdateSettings {
  constructor(
    private readonly players: PlayerRepository,
    private readonly settings: SettingsRepository,
    private readonly scenes: SceneRepository,
  ) {}

  execute(playerId: unknown, rawPatch: unknown): SettingsDto {
    const { id } = requirePlayer(this.players, playerId);
    const patch = sanitizeSettings(rawPatch, (sceneId) => this.scenes.exists(sceneId));
    if (Object.keys(patch).length) this.settings.update(id, patch);
    return this.settings.get(id);
  }
}
