import type { LoginResponse } from '../../../../shared/contracts';
import { PlayerName } from '../../domain/player/player-name';
import type { PlayerRepository, SettingsRepository } from '../../domain/player/repositories';
import type { UnitOfWork } from '../ports';
import type { ProfileAssembler } from './profile-assembler';

/** "Login" pelo nome: o mesmo nome sempre devolve o mesmo progresso. */
export class LoginPlayer {
  constructor(
    private readonly players: PlayerRepository,
    private readonly settings: SettingsRepository,
    private readonly profiles: ProfileAssembler,
    private readonly uow: UnitOfWork,
  ) {}

  execute(rawName: unknown): LoginResponse {
    const name = PlayerName.parse(rawName);
    const existing = this.players.findByName(name);
    if (existing) return { ...this.profiles.build(existing), returning: true };

    const player = this.uow.run(() => {
      const created = this.players.create(name);
      this.settings.createDefaults(created.id);
      return created;
    });
    return { ...this.profiles.build(player), returning: false };
  }
}
