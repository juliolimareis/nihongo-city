import type { TvVideoDto } from '../../../../shared/contracts';
import { type TvVideo, clampPart } from '../../domain/tv/video';
import { tvMediaUrl } from '../assets';

export function toTvVideoDto(video: TvVideo, savedPart: number | undefined): TvVideoDto {
  return {
    id: video.id,
    title: video.title,
    channel: video.channel,
    durationS: video.durationS,
    thumbnail: video.thumbnailFile ? tvMediaUrl(video.id, video.thumbnailFile) : null,
    parts: video.parts,
    part: clampPart(savedPart ?? 1, video.parts),
  };
}
