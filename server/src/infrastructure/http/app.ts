import express, { type Express } from 'express';
import { apiNotFound, errorHandler } from './error-handler';
import { type CardUseCases, cardRoutes } from './controllers/card-routes';
import { type GameUseCases, gameRoutes } from './controllers/game-routes';
import { type PlayerUseCases, playerRoutes } from './controllers/player-routes';
import { type RemoteUseCases, remoteRoutes } from './controllers/remote-routes';

export interface StaticDirs {
  publicDir: string;
  audiosDir: string;
  npcDir: string;
  imgDir: string;
}

export interface HttpUseCases {
  player: PlayerUseCases;
  cards: CardUseCases;
  game: GameUseCases;
  remote: RemoteUseCases;
}

export function createHttpApp(dirs: StaticDirs, uc: HttpUseCases): Express {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.use(express.static(dirs.publicDir));
  app.use('/audios', express.static(dirs.audiosDir, { maxAge: '7d' }));
  app.use('/npcs', express.static(dirs.npcDir, { maxAge: '1h' }));
  app.use('/img', express.static(dirs.imgDir, { maxAge: '7d' }));

  app.use('/api/players', playerRoutes(uc.player));
  app.use('/api/cards', cardRoutes(uc.cards));
  app.use('/api/remote', remoteRoutes(uc.remote));
  app.use('/api', gameRoutes(uc.game));

  app.use('/api', apiNotFound);
  app.use(errorHandler);
  return app;
}
