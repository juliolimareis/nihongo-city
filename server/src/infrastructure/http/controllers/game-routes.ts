import { Router } from 'express';
import type { ConvertReading } from '../../../application/game/convert-reading';
import type { FinishEvent } from '../../../application/game/finish-event';
import type { GetNextInvite } from '../../../application/game/get-next-invite';
import type { ListMusic } from '../../../application/game/list-music';
import type { ListScenes } from '../../../application/game/list-scenes';
import type { RecordAttempt } from '../../../application/game/record-attempt';
import type { StartEvent } from '../../../application/game/start-event';

export interface GameUseCases {
  listScenes: ListScenes;
  listMusic: ListMusic;
  startEvent: StartEvent;
  nextInvite: GetNextInvite;
  recordAttempt: RecordAttempt;
  finishEvent: FinishEvent;
  convertReading: ConvertReading;
}

export function gameRoutes(uc: GameUseCases): Router {
  const router = Router();

  router.get('/scenes', (_req, res) => {
    res.json(uc.listScenes.execute());
  });

  router.get('/music', (_req, res) => {
    res.json(uc.listMusic.execute());
  });

  router.post('/events', (req, res) => {
    const { player, scenarioId, locationId, source } = req.body || {};
    res.status(201).json(uc.startEvent.execute({ player, scenarioId, locationId, source }));
  });

  router.get('/invites/next', (req, res) => {
    const invite = uc.nextInvite.execute(req.query.player);
    if (invite) res.json(invite);
    else res.status(204).end();
  });

  router.post('/events/:id/attempts', (req, res) => {
    res.json(uc.recordAttempt.execute({ eventId: req.params.id, ...(req.body || {}) }));
  });

  router.post('/events/:id/finish', (req, res) => {
    const { outcome, seenStepIds } = req.body || {};
    res.json(uc.finishEvent.execute({ eventId: req.params.id, outcome, seenStepIds }));
  });

  router.post('/reading', (req, res) => {
    res.json(uc.convertReading.execute(req.body?.texts));
  });

  return router;
}
