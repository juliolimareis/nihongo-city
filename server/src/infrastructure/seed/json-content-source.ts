import fs from 'node:fs';
import path from 'node:path';
import type { ContentSource } from '../../application/content/seed-content';
import type { ContentCatalog } from '../../domain/content/catalog';

/** Lê server/seed/*.json, a fonte da verdade do conteúdo. */
export class JsonContentSource implements ContentSource {
  constructor(private readonly dir: string) {}

  load(): ContentCatalog {
    const read = <T>(name: string): T => JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')) as T;
    return {
      expressions: read('expressions.json'),
      npcs: read('npcs.json'),
      scenes: read('scenes.json'),
      locations: read('locations.json'),
      scenarios: read('scenarios.json'),
    };
  }
}
