import fs from 'node:fs';
import path from 'node:path';

/** Raiz do projeto (pasta do package.json), igual rodando via tsx ou compilado em dist/. */
function findRoot(start: string): string {
  let dir = start;
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('package.json não encontrado');
    dir = parent;
  }
  return dir;
}

const ROOT = findRoot(__dirname);

export const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3000,
  httpsPort: Number(process.env.HTTPS_PORT) || 3443,
  publicHost: process.env.PUBLIC_HOST || null,
  production: process.env.NODE_ENV === 'production',
  dbFile: process.env.NIHONGO_DB || path.join(ROOT, 'server', 'db', 'nihongo.db'),
  seedDir: path.join(ROOT, 'server', 'seed'),
  certDir: path.join(ROOT, 'server', 'certs'),
  publicDir: path.join(ROOT, 'public'),
  clientDir: path.join(ROOT, 'client'),
  audiosDir: path.join(ROOT, 'audios'),
  musicDir: path.join(ROOT, 'audios', 'game-sounds'),
  imgDir: path.join(ROOT, 'img'),
  npcDir: path.join(ROOT, 'img', 'npcs'),
} as const;

export type Config = typeof config;
