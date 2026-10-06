import type { TvProgressResponse } from '../../../../shared/contracts';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError, ValidationError } from '../../domain/shared/errors';
import type { TvProgressRepository, TvVideoRepository } from '../../domain/tv/repositories';
import type { Clock } from '../ports';
import { requirePlayer } from '../player/require-player';

export interface SaveTvProgressInput {
  player: unknown;
  videoId: unknown;
  part: unknown;
}

/** Guarda a parte em que o jogador está; o vídeo salvo por último é o que o menu oferece para continuar. */
export class SaveTvProgress {
  constructor(
    private readonly players: PlayerRepository,
    private readonly videos: TvVideoRepository,
    private readonly progress: TvProgressRepository,
    private readonly clock: Clock,
  ) {}

  execute(input: SaveTvProgressInput): TvProgressResponse {
    const { id } = requirePlayer(this.players, input.player);
    const video = this.videos.find(String(input.videoId ?? ''));
    if (!video) throw new NotFoundError('Vídeo não encontrado');
    const part = Number(input.part);
    if (!Number.isInteger(part) || part < 1 || part > video.parts) throw new ValidationError('Parte inválida');
    const saved = { videoId: video.id, part };
    this.progress.save(id, saved, this.clock.now());
    return saved;
  }
}
