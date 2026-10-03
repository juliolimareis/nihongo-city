import fs from 'node:fs';
import type { MusicCatalog } from '../../application/ports';

const AUDIO_EXT = /\.(mp3|ogg|m4a|wav)$/i;

export class FsMusicCatalog implements MusicCatalog {
  constructor(private readonly dir: string) {}

  list(): string[] {
    try {
      return fs.readdirSync(this.dir).filter((f) => AUDIO_EXT.test(f)).sort();
    } catch {
      return []; // pasta ausente: sem música
    }
  }
}
