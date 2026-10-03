import type { ApiError } from '../../shared/contracts';
import type { GameApi } from '../application/ports';

export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError((data as ApiError).error || `Erro ${res.status}`, res.status);
  return data as T;
}

/** Adaptador HTTP da API do jogo. */
export const httpGameApi: GameApi = {
  login: (name) => request('POST', '/api/players', { name }),
  getPlayer: (id) => request('GET', `/api/players/${id}`),
  saveSettings: (id, patch) => request('PUT', `/api/players/${id}/settings`, patch),
  resetProgress: (id) => request('DELETE', `/api/players/${id}/progress`),

  scenes: () => request('GET', '/api/scenes'),
  music: () => request('GET', '/api/music'),
  startEvent: (body) => request('POST', '/api/events', body),
  attempt: (eventId, body) => request('POST', `/api/events/${eventId}/attempts`, body),
  finishEvent: (eventId, body) => request('POST', `/api/events/${eventId}/finish`, body),
  nextInvite: (player) => request('GET', `/api/invites/next?player=${player}`),
  readings: (texts) => request('POST', '/api/reading', { texts }),

  cards: (player, filter = {}) =>
    request('GET', `/api/cards?${new URLSearchParams({ player: String(player), ...filter })}`),
  dueCards: (player, limit = 20) => request('GET', `/api/cards/due?player=${player}&limit=${limit}`),
  review: (player, exprId, mode, rating) =>
    request('POST', `/api/cards/${encodeURIComponent(exprId)}/review`, { player, mode, rating }),
};
