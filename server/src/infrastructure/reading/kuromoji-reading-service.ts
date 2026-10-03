import path from 'node:path';
import kuromoji from 'kuromoji';
import type { ReadingService } from '../../application/ports';
import { katakanaToHiragana, normalizeForReading } from '../../domain/language/japanese';

type Tokenizer = kuromoji.Tokenizer<kuromoji.IpadicFeatures>;

/**
 * Leitura em hiragana via kuromoji. Enquanto (ou se) o dicionário não carregar,
 * converte só katakana → hiragana.
 */
export class KuromojiReadingService implements ReadingService {
  private tokenizer: Tokenizer | null = null;
  readonly ready: Promise<void>;

  constructor() {
    const dicPath = path.join(path.dirname(require.resolve('kuromoji')), '..', 'dict');
    this.ready = new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath }).build((err, t) => {
        if (err) return reject(err);
        this.tokenizer = t;
        resolve();
      });
    });
    this.ready.catch(() => { /* tratado por quem aguarda `ready` */ });
  }

  reading(text: string): string {
    const normalized = normalizeForReading(text);
    if (!this.tokenizer) return katakanaToHiragana(normalized);
    return katakanaToHiragana(
      this.tokenizer.tokenize(normalized)
        .map((t) => (t.reading && t.reading !== '*' ? t.reading : t.surface_form))
        .join(''),
    );
  }
}
