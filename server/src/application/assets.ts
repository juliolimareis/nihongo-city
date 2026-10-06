// Caminhos públicos dos arquivos estáticos servidos pelo servidor HTTP.

export const voiceUrl = (file: string | null): string | null => (file ? `/audios/voices/${file}` : null);
export const npcImageUrl = (file: string): string => `/npcs/${file}`;
export const sceneImageUrl = (file: string): string => `/img/backgrounds/${file}`;
export const musicUrl = (file: string): string => `/audios/game-sounds/${encodeURIComponent(file)}`;
export const tvMediaUrl = (videoId: string, file: string): string =>
  `/media/tv/${encodeURIComponent(videoId)}/${encodeURIComponent(file)}`;
