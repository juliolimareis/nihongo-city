import type { TvVideoDetailDto } from '../../../../shared/contracts';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError } from '../../domain/shared/errors';
import type { TvProgressRepository, TvVideoRepository } from '../../domain/tv/repositories';
import { tvMediaUrl } from '../assets';
import { requirePlayer } from '../player/require-player';
import { toTvVideoDto } from './tv-mappers';

export interface GetTvVideoInput {
  player: unknown;
  videoId: string;
}

export class GetTvVideo {
  constructor(
    private readonly players: PlayerRepository,
    private readonly videos: TvVideoRepository,
    private readonly progress: TvProgressRepository,
  ) {}

  execute(input: GetTvVideoInput): TvVideoDetailDto {
    const { id } = requirePlayer(this.players, input.player);
    const video = this.videos.find(input.videoId);
    if (!video) throw new NotFoundError('Vídeo não encontrado');
    const saved = this.progress.allFor(id).find((p) => p.videoId === video.id);
    return {
      ...toTvVideoDto(video, saved?.part),
      partList: this.videos.parts(video.id).map((p) => ({
        index: p.index,
        durationS: p.durationS,
        audio: tvMediaUrl(video.id, p.audioFile),
        video: tvMediaUrl(video.id, p.videoFile),
      })),
    };
  }
}
