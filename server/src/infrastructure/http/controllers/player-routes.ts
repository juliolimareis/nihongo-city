import { Router } from 'express';
import type { GetProfile } from '../../../application/player/get-profile';
import type { LoginPlayer } from '../../../application/player/login-player';
import type { ResetProgress } from '../../../application/player/reset-progress';
import type { UpdateSettings } from '../../../application/player/update-settings';

export interface PlayerUseCases {
  login: LoginPlayer;
  getProfile: GetProfile;
  updateSettings: UpdateSettings;
  resetProgress: ResetProgress;
}

export function playerRoutes(uc: PlayerUseCases): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const result = uc.login.execute(req.body?.name);
    res.status(result.returning ? 200 : 201).json(result);
  });

  router.get('/:id', (req, res) => {
    res.json(uc.getProfile.execute(req.params.id));
  });

  router.put('/:id/settings', (req, res) => {
    res.json(uc.updateSettings.execute(req.params.id, req.body));
  });

  router.delete('/:id/progress', (req, res) => {
    res.json(uc.resetProgress.execute(req.params.id));
  });

  return router;
}
