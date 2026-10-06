import type { TvPart, TvProgress, TvTranscript, TvVideo } from './video';

/** Catálogo de vídeos (escrito pelo scripts/add_video.py; o servidor só lê). */
export interface TvVideoRepository {
  /** Vídeos que têm ao menos uma parte, na ordem em que foram adicionados. */
  list(): TvVideo[];
  find(id: string): TvVideo | null;
  parts(videoId: string): TvPart[];
  transcript(videoId: string, part: number): TvTranscript | null;
}

export interface TvProgressRepository {
  /** Do vídeo mais recente para o mais antigo. */
  allFor(playerId: number): TvProgress[];
  save(playerId: number, progress: TvProgress, at: Date): void;
  deleteAllFor(playerId: number): void;
}
