import type { SpeechResponse } from '../../../../shared/contracts';
import { cleanTranscripts, parseRemoteAction, parseRemoteState } from '../../domain/remote/remote-session';
import type { RemoteSessionRepository } from '../../domain/remote/repositories';
import type { Clock } from '../ports';
import type { SessionLocator } from './session-locator';

/** TV → celular: o que está na tela. */
export class PublishRemoteState {
  constructor(private readonly locator: SessionLocator) {}

  execute(code: unknown, state: unknown): void {
    this.locator.require(code).publishState(parseRemoteState(state));
  }
}

/** Celular → TV: transcrições reconhecidas. */
export class RelaySpeech {
  constructor(private readonly locator: SessionLocator) {}

  execute(code: unknown, transcripts: unknown, listenId: unknown): SpeechResponse {
    const session = this.locator.require(code);
    const delivered = session.relaySpeech(cleanTranscripts(transcripts), (listenId ?? null) as number | null);
    return { ok: true, delivered };
  }
}

/** Celular → TV: botões (ex.: "Continuar ▶"). */
export class RelayAction {
  constructor(private readonly locator: SessionLocator) {}

  execute(code: unknown, action: unknown): void {
    const session = this.locator.require(code);
    session.relayAction(parseRemoteAction(action));
  }
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export class PurgeExpiredSessions {
  constructor(private readonly sessions: RemoteSessionRepository, private readonly clock: Clock) {}

  execute(): void {
    this.sessions.removeExpired(this.clock.now().getTime(), SESSION_TTL_MS);
  }
}
