import type { PhoneMessage, RemoteAction, SpeechResponse } from '../../shared/contracts';

export type LinkStatus = 'open' | 'reconnecting' | 'expired';

/** Lado do celular: recebe o estado da TV (SSE) e envia falas e botões (HTTP). */
export class PhoneRemoteLink {
  constructor(private readonly code: string) {}

  private post(path: string, body: unknown): Promise<Response> {
    return fetch(`/api/remote/${this.code}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  action(action: RemoteAction): void {
    void this.post('action', { action });
  }

  async speech(transcripts: string[], listenId: number | null): Promise<SpeechResponse> {
    const res = await this.post('speech', { transcripts, listenId });
    return await res.json() as SpeechResponse;
  }

  connect(onMessage: (msg: PhoneMessage) => void, onStatus: (status: LinkStatus) => void): void {
    const source = new EventSource(`/api/remote/${this.code}/phone`);
    source.onopen = () => onStatus('open');
    source.onmessage = (e) => onMessage(JSON.parse(e.data) as PhoneMessage);
    source.onerror = () => onStatus(source.readyState === EventSource.CLOSED ? 'expired' : 'reconnecting');
  }
}
