import type { TvLibraryDto } from '../../../../shared/contracts';
import type { PlayerRepository } from '../../domain/player/repositories';
import type { TvProgressRepository, TvVideoRepository } from '../../domain/tv/repositories';
import { requirePlayer } from '../player/require-player';
import { toTvVideoDto } from './tv-mappers';

export class ListTvVideos {
  constructor(
    private readonly players: PlayerRepository,
    private readonly videos: TvVideoRepository,
    private readonly progress: TvProgressRepository,
  ) {}

  execute(playerId: unknown): TvLibraryDto {
    const { id } = requirePlayer(this.players, playerId);
    const videos = this.videos.list();
    const saved = this.progress.allFor(id);
    const partOf = new Map(saved.map((p) => [p.videoId, p.part]));
    const last = saved.find((p) => videos.some((v) => v.id === p.videoId));
    return {
      videos: videos.map((v) => toTvVideoDto(v, partOf.get(v.id))),
      lastVideoId: last?.videoId ?? null,
    };
  }
}
