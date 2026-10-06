import type { SubtitleMode, TvPrefsStore } from '../application/ports';

const STORAGE_KEY = 'nihongo.tvSubtitles';
const MODES: SubtitleMode[] = ['off', 'ja', 'pt'];

/** Lembra a legenda escolhida neste navegador (falha em silêncio no modo privado). */
export const localTvPrefs: TvPrefsStore = {
  subtitles() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as SubtitleMode | null;
      return saved && MODES.includes(saved) ? saved : 'ja';
    } catch {
      return 'ja';
    }
  },
  setSubtitles(mode) { try { localStorage.setItem(STORAGE_KEY, mode); } catch { /* modo privado */ } },
};
