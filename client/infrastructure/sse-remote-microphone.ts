import type { ApiError, PairingDto, RemoteAction, RemoteScreen, RemoteState, TvMessage } from '../../shared/contracts';
import type { RemoteMicrophone } from '../application/ports';

const STORE_KEY = 'nihongo.remoteCode';

/** Adaptador SSE + HTTP do celular-microfone (lado da TV). */
export class SseRemoteMicrophone implements RemoteMicrophone {
  connected = false;
  private code: string | null = null;
  private source: EventSource | null = null;
  private pairingInfo: PairingDto | null = null;
  private listenSeq = 0;
  private pendingListen: { id: number; resolve: (value: string[] | null) => void } | null = null;
  private readonly connectionListeners: ((connected: boolean) => void)[] = [];
  private readonly actionListeners: ((action: RemoteAction) => void)[] = [];

  constructor(private readonly getPlayerId: () => number) {}

  onConnectionChange(listener: (connected: boolean) => void): void {
    this.connectionListeners.push(listener);
  }

  onAction(listener: (action: RemoteAction) => void): void {
    this.actionListeners.push(listener);
  }

  setState(state: RemoteState): void {
    if (this.code) void this.post('state', { state });
  }

  listen(screen: RemoteScreen): Promise<string[] | null> {
    this.cancelListen();
    const id = ++this.listenSeq;
    this.setState({ ...screen, listenId: id });
    return new Promise((resolve) => { this.pendingListen = { id, resolve }; });
  }

  cancelListen(): void {
    if (this.pendingListen) {
      const { resolve } = this.pendingListen;
      this.pendingListen = null;
      resolve(null);
    }
  }

  async pairing(): Promise<PairingDto> {
    if (!this.pairingInfo && this.code) {
      const res = await fetch(`/api/remote/${this.code}/pairing`);
      if (res.ok) this.pairingInfo = await res.json() as PairingDto;
    }
    if (!this.pairingInfo) await this.createSession();
    return this.pairingInfo as PairingDto;
  }

  async renewSession(): Promise<PairingDto> {
    this.source?.close();
    this.setConnected(false);
    await this.createSession();
    return this.pairingInfo as PairingDto;
  }

  resume(): void {
    try { this.code = sessionStorage.getItem(STORE_KEY); } catch { this.code = null; }
    if (this.code) this.openStream();
  }

  private post(path: string, body: unknown): Promise<unknown> {
    if (!this.code) return Promise.resolve();
    return fetch(`/api/remote/${this.code}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  private setConnected(value: boolean): void {
    if (this.connected === value) return;
    this.connected = value;
    this.connectionListeners.forEach((fn) => fn(value));
  }

  private openStream(): void {
    this.source?.close();
    const source = new EventSource(`/api/remote/${this.code}/tv`);
    this.source = source;
    source.onmessage = (e) => {
      const msg = JSON.parse(e.data) as TvMessage;
      if (msg.type === 'phone') this.setConnected(msg.connected);
      if (msg.type === 'action') this.actionListeners.forEach((fn) => fn(msg.action));
      const pending = this.pendingListen;
      if (msg.type === 'speech' && pending && (msg.listenId == null || msg.listenId === pending.id)) {
        this.pendingListen = null;
        pending.resolve(msg.transcripts);
      }
    };
    source.onerror = () => {
      // 404 (código expirado, servidor reiniciado): o EventSource fecha e não tenta de novo.
      if (source.readyState === EventSource.CLOSED) {
        this.setConnected(false);
        this.code = null;
        try { sessionStorage.removeItem(STORE_KEY); } catch { /* sem storage */ }
      }
    };
  }

  private async createSession(): Promise<void> {
    const res = await fetch('/api/remote/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player: this.getPlayerId() }),
    });
    if (!res.ok) throw new Error((await res.json() as ApiError).error || 'Falha ao criar sessão');
    this.pairingInfo = await res.json() as PairingDto;
    this.code = this.pairingInfo.code;
    try { sessionStorage.setItem(STORE_KEY, this.code); } catch { /* sem storage */ }
    this.openStream();
  }
}
