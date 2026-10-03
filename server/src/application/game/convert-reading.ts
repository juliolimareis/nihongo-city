import type { ReadingResponse } from '../../../../shared/contracts';
import type { ReadingService } from '../ports';

const MAX_TEXTS = 20;
const MAX_LENGTH = 300;

export class ConvertReading {
  constructor(private readonly reading: ReadingService) {}

  execute(texts: unknown): ReadingResponse {
    const list = Array.isArray(texts) ? texts.slice(0, MAX_TEXTS) : [];
    return { readings: list.map((t) => this.reading.reading(String(t).slice(0, MAX_LENGTH))) };
  }
}
