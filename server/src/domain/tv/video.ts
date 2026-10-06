/** Fala de uma legenda, em segundos a partir do início da parte. */
export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** Vídeo do YouTube cortado em partes pelo scripts/add_video.py. */
export interface TvVideo {
  id: string;
  title: string;
  channel: string;
  durationS: number;
  thumbnailFile: string | null;
  parts: number;
}

/** Trecho de até ~5 min, com um arquivo de vídeo e um de áudio. */
export interface TvPart {
  index: number;
  durationS: number;
  videoFile: string;
  audioFile: string;
}

export interface TvTranscript {
  ja: SubtitleCue[];
  pt: SubtitleCue[];
}

/** Parte em que o jogador parou em um vídeo (começa em 1). */
export interface TvProgress {
  videoId: string;
  part: number;
}

/** Progresso salvo pode apontar para uma parte que deixou de existir se o vídeo foi recortado. */
export const clampPart = (part: number, parts: number): number => Math.min(Math.max(1, part), Math.max(1, parts));
