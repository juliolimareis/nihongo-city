import { Router } from 'express';
import type { GetTvTranscript } from '../../../application/tv/get-tv-transcript';
import type { GetTvVideo } from '../../../application/tv/get-tv-video';
import type { ListTvVideos } from '../../../application/tv/list-tv-videos';
import type { SaveTvProgress } from '../../../application/tv/save-tv-progress';

export interface TvUseCases {
  listVideos: ListTvVideos;
  getVideo: GetTvVideo;
  getTranscript: GetTvTranscript;
  saveProgress: SaveTvProgress;
}

export function tvRoutes(uc: TvUseCases): Router {
  const router = Router();

  router.get('/videos', (req, res) => {
    res.json(uc.listVideos.execute(req.query.player));
  });

  router.get('/videos/:id', (req, res) => {
    res.json(uc.getVideo.execute({ player: req.query.player, videoId: req.params.id }));
  });

  router.get('/videos/:id/parts/:part/transcript', (req, res) => {
    res.json(uc.getTranscript.execute({ videoId: req.params.id, part: req.params.part }));
  });

  router.put('/progress', (req, res) => {
    const { player, videoId, part } = req.body || {};
    res.json(uc.saveProgress.execute({ player, videoId, part }));
  });

  return router;
}
