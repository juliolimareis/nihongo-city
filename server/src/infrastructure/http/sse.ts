import type { Request, Response } from 'express';
import type { RemoteClient } from '../../domain/remote/remote-session';

const PING_MS = 25000;

/** Abre um stream Server-Sent Events e o expõe como um RemoteClient. */
export function openSse<M>(req: Request, res: Response, onClose: () => void): RemoteClient<M> {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 2000\n\n');
  const ping = setInterval(() => res.write(': ping\n\n'), PING_MS);
  req.on('close', () => {
    clearInterval(ping);
    onClose();
  });
  return { send: (message: M) => { res.write(`data: ${JSON.stringify(message)}\n\n`); } };
}
