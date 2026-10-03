import type { PhoneMessage, RemoteAction, RemoteState, TvMessage } from '../../../../shared/contracts';
import { ValidationError } from '../shared/errors';

/** Um ouvinte conectado (na prática, um stream SSE). */
export interface RemoteClient<M> {
  send(message: M): void;
}

export interface SessionOwner {
  readonly id: number;
  readonly name: string;
}

const MAX_TRANSCRIPTS = 8;
const MAX_TRANSCRIPT_LENGTH = 200;
const ACTIONS: readonly RemoteAction[] = ['continue', 'replay'];

export function cleanTranscripts(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((t) => String(t).slice(0, MAX_TRANSCRIPT_LENGTH))
    .filter(Boolean)
    .slice(0, MAX_TRANSCRIPTS);
}

export function parseRemoteAction(value: unknown): RemoteAction {
  if (!ACTIONS.includes(value as RemoteAction)) throw new ValidationError('Ação inválida');
  return value as RemoteAction;
}

export function parseRemoteState(value: unknown): RemoteState {
  return value && typeof value === 'object' ? (value as RemoteState) : { mode: 'idle' };
}

/**
 * Sessão em memória: a TV cria um código, o celular entra com ele.
 * TV → celular: estado da tela (pergunta, opções, resultado).
 * Celular → TV: transcrições da fala e botões.
 */
export class RemoteSession {
  private readonly tvs = new Set<RemoteClient<TvMessage>>();
  private readonly phones = new Set<RemoteClient<PhoneMessage>>();
  private state: RemoteState = { mode: 'idle' };

  constructor(readonly code: string, readonly owner: SessionOwner, private touchedAt: number) {}

  touch(now: number): void {
    this.touchedAt = now;
  }

  /** Expirada = sem uso há mais que o TTL e sem ninguém conectado. */
  isExpired(now: number, ttlMs: number): boolean {
    return now - this.touchedAt > ttlMs && !this.tvs.size && !this.phones.size;
  }

  attachTv(client: RemoteClient<TvMessage>): void {
    this.tvs.add(client);
    client.send(this.phoneStatus());
  }

  detachTv(client: RemoteClient<TvMessage>): void {
    this.tvs.delete(client);
  }

  attachPhone(client: RemoteClient<PhoneMessage>): void {
    this.phones.add(client);
    client.send({ type: 'hello', player: this.owner.name });
    client.send({ type: 'state', state: this.state });
    this.broadcastToTvs(this.phoneStatus());
  }

  detachPhone(client: RemoteClient<PhoneMessage>): void {
    this.phones.delete(client);
    this.broadcastToTvs(this.phoneStatus());
  }

  publishState(state: RemoteState): void {
    this.state = state;
    for (const phone of this.phones) phone.send({ type: 'state', state });
  }

  /** Repassa a fala para a TV; devolve se havia alguma TV ouvindo. */
  relaySpeech(transcripts: string[], listenId: number | null): boolean {
    this.broadcastToTvs({ type: 'speech', transcripts, listenId });
    return this.tvs.size > 0;
  }

  relayAction(action: RemoteAction): void {
    this.broadcastToTvs({ type: 'action', action });
  }

  private phoneStatus(): TvMessage {
    return { type: 'phone', connected: this.phones.size > 0 };
  }

  private broadcastToTvs(message: TvMessage): void {
    for (const tv of this.tvs) tv.send(message);
  }
}
