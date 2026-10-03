import { musicUrl } from '../assets';
import type { MusicCatalog } from '../ports';

export class ListMusic {
  constructor(private readonly catalog: MusicCatalog) {}

  execute(): string[] {
    return this.catalog.list().map(musicUrl);
  }
}
