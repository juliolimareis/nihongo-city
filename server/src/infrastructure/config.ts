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

/** Carrega o .env da raiz, se existir; variáveis já definidas no ambiente têm prioridade. */
const ENV_FILE = path.join(ROOT, '.env');
if (fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);

/** Endereço externo completo (ex.: túnel da Cloudflare); aceita sem esquema e ignora barras finais. */
function parsePublicUrl(value: string | undefined): string | null {
  const trimmed = (value || '').trim().replace(/\/+$/, '');
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export const config = {
  root: ROOT,
  port: Number(process.env.PORT) || 3440,
  httpsPort: Number(process.env.HTTPS_PORT) || 3443,
  publicHost: process.env.PUBLIC_HOST || null,
  publicUrl: parsePublicUrl(process.env.PUBLIC_URL),
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
  mediaDir: path.join(ROOT, 'media'),
} as const;

export type Config = typeof config;
