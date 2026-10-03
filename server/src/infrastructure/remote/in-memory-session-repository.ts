import type { RemoteSession } from '../../domain/remote/remote-session';
import type { RemoteSessionRepository } from '../../domain/remote/repositories';

export class InMemoryRemoteSessionRepository implements RemoteSessionRepository {
  private readonly sessions = new Map<string, RemoteSession>();

  add(session: RemoteSession): void {
    this.sessions.set(session.code, session);
  }

  find(code: string): RemoteSession | null {
    return this.sessions.get(code) ?? null;
  }

  has(code: string): boolean {
    return this.sessions.has(code);
  }

  removeExpired(now: number, ttlMs: number): void {
    for (const [code, s] of this.sessions) if (s.isExpired(now, ttlMs)) this.sessions.delete(code);
  }
}
