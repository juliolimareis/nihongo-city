import { type Request, Router } from 'express';
import type { PhoneMessage, TvMessage } from '../../../../../shared/contracts';
import type { ConnectPhone, ConnectTv } from '../../../application/remote/connect-stream';
import type { CreateRemoteSession } from '../../../application/remote/create-session';
import type { GetPairing } from '../../../application/remote/get-pairing';
import type { RequestOrigin } from '../../../application/remote/pairing-info';
import type { PublishRemoteState, RelayAction, RelaySpeech } from '../../../application/remote/relay';
import { openSse } from '../sse';

export interface RemoteUseCases {
  createSession: CreateRemoteSession;
  getPairing: GetPairing;
  connectTv: ConnectTv;
  connectPhone: ConnectPhone;
  publishState: PublishRemoteState;
  relaySpeech: RelaySpeech;
  relayAction: RelayAction;
}

const originOf = (req: Request): RequestOrigin => ({
  hostname: req.hostname, protocol: req.protocol, localPort: req.socket.localPort,
});

export function remoteRoutes(uc: RemoteUseCases): Router {
  const router = Router();

  router.post('/sessions', async (req, res) => {
    res.status(201).json(await uc.createSession.execute(req.body?.player, originOf(req)));
  });

  router.get('/:code/pairing', async (req, res) => {
    res.json(await uc.getPairing.execute(req.params.code, originOf(req)));
  });

  // TV escuta falas e o status do celular.
  router.get('/:code/tv', (req, res) => {
    uc.connectTv.execute(req.params.code, (onClose) => openSse<TvMessage>(req, res, onClose));
  });

  // Celular escuta o estado da TV.
  router.get('/:code/phone', (req, res) => {
    uc.connectPhone.execute(req.params.code, (onClose) => openSse<PhoneMessage>(req, res, onClose));
  });

  router.post('/:code/state', (req, res) => {
    uc.publishState.execute(req.params.code, req.body?.state);
    res.json({ ok: true });
  });

  router.post('/:code/speech', (req, res) => {
    res.json(uc.relaySpeech.execute(req.params.code, req.body?.transcripts, req.body?.listenId));
  });

  // Botões do celular que acionam a TV (ex.: "Continuar ▶").
  router.post('/:code/action', (req, res) => {
    uc.relayAction.execute(req.params.code, req.body?.action);
    res.json({ ok: true });
  });

  return router;
}
