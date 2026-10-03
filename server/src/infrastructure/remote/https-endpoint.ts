import type { HttpsEndpoint } from '../../application/ports';

/** A porta só é conhecida depois que o servidor HTTPS sobe (se subir). */
export class MutableHttpsEndpoint implements HttpsEndpoint {
  private current: number | null = null;

  constructor(readonly publicHost: string | null) {}

  port(): number | null {
    return this.current;
  }

  setPort(port: number): void {
    this.current = port;
  }
}
