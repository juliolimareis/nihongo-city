import type { PlayerIdStore } from '../application/ports';

const STORAGE_KEY = 'nihongo.playerId';

/** Lembra o último jogador neste navegador (falha em silêncio no modo privado). */
export const localPlayerStore: PlayerIdStore = {
  get() { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set(id) { try { localStorage.setItem(STORAGE_KEY, String(id)); } catch { /* modo privado */ } },
  clear() { try { localStorage.removeItem(STORAGE_KEY); } catch { /* modo privado */ } },
};
