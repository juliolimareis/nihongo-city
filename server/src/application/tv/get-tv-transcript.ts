import type { TvTranscriptDto } from '../../../../shared/contracts';
import { NotFoundError } from '../../domain/shared/errors';
import type { TvVideoRepository } from '../../domain/tv/repositories';

export interface GetTvTranscriptInput {
  videoId: string;
  part: unknown;
}

export class GetTvTranscript {
  constructor(private readonly videos: TvVideoRepository) {}

  execute(input: GetTvTranscriptInput): TvTranscriptDto {
    const transcript = this.videos.transcript(input.videoId, Number(input.part));
    if (!transcript) throw new NotFoundError('Parte não encontrada');
    return transcript;
  }
}
