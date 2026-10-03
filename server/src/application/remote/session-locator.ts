import type { RemoteSession } from '../../domain/remote/remote-session';
import type { RemoteSessionRepository } from '../../domain/remote/repositories';
import { NotFoundError } from '../../domain/shared/errors';
import type { Clock } from '../ports';

/** Encontra a sessão pelo código (sem diferenciar maiúsculas) e marca o uso. */
export class SessionLocator {
  constructor(private readonly sessions: RemoteSessionRepository, private readonly clock: Clock) {}

  require(rawCode: unknown): RemoteSession {
    const session = this.sessions.find(String(rawCode || '').toUpperCase());
    if (!session) throw new NotFoundError('Código inválido ou expirado. Gere um novo QR code na TV.');
    session.touch(this.clock.now().getTime());
    return session;
  }
}
