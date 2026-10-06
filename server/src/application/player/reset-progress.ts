import type { ProfileDto } from '../../../../shared/contracts';
import type { CardRepository, ReviewLogRepository } from '../../domain/deck/repositories';
import type { GameEventRepository } from '../../domain/event/repositories';
import type { PlayerRepository } from '../../domain/player/repositories';
import type { TvProgressRepository } from '../../domain/tv/repositories';
import type { UnitOfWork } from '../ports';
import type { ProfileAssembler } from './profile-assembler';
import { requirePlayer } from './require-player';

/** Apaga baralho, revisões, eventos e progresso dos vídeos; zera XP e nível. */
export class ResetProgress {
  constructor(
    private readonly players: PlayerRepository,
    private readonly cards: CardRepository,
    private readonly reviews: ReviewLogRepository,
    private readonly events: GameEventRepository,
    private readonly tvProgress: TvProgressRepository,
    private readonly profiles: ProfileAssembler,
    private readonly uow: UnitOfWork,
  ) {}

  execute(playerId: unknown): ProfileDto {
    const player = requirePlayer(this.players, playerId);
    this.uow.run(() => {
      this.cards.deleteAllFor(player.id);
      this.reviews.deleteAllFor(player.id);
      this.events.deleteAllFor(player.id);
      this.tvProgress.deleteAllFor(player.id);
      player.resetProgress();
      this.players.save(player);
    });
    return this.profiles.build(player);
  }
}
