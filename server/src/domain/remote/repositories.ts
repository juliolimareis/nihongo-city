import type { RemoteSession } from './remote-session';

export interface RemoteSessionRepository {
  add(session: RemoteSession): void;
  find(code: string): RemoteSession | null;
  has(code: string): boolean;
  removeExpired(now: number, ttlMs: number): void;
}

/** Gera códigos curtos e legíveis para o pareamento. */
export interface PairingCodeGenerator {
  generate(isTaken: (code: string) => boolean): string;
}
