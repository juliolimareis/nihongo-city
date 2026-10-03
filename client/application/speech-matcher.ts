import { normalizeJp, similarity } from '../domain/text-match';
import type { GameApi } from './ports';

export interface Speakable {
  jp: string;
  kana: string;
  variants?: string[];
}

export interface MatchResult<O> {
  option: O | null;
  score: number;
  ranking: { option: O; score: number }[];
}

/** Compara falas com expressões usando a leitura em hiragana do servidor (kuromoji), com cache. */
export class SpeechMatcher {
  private readonly cache = new Map<string, string>();

  constructor(private readonly api: Pick<GameApi, 'readings'>) {}

  /** Leitura em hiragana para vários textos. */
  async readingsOf(texts: string[]): Promise<string[]> {
    const missing = [...new Set(texts.filter((t) => t && !this.cache.has(t)))];
    if (missing.length) {
      try {
        const { readings } = await this.api.readings(missing);
        missing.forEach((t, i) => this.cache.set(t, normalizeJp(readings[i])));
      } catch {
        missing.forEach((t) => this.cache.set(t, normalizeJp(t)));
      }
    }
    return texts.map((t) => this.cache.get(t) ?? normalizeJp(t));
  }

  /** Formas aceitas de uma expressão: kana, escrita com kanji, leitura da escrita e variantes. */
  async expressionForms(expr: Speakable): Promise<string[]> {
    const variants = expr.variants || [];
    const readings = await this.readingsOf([expr.jp, ...variants]);
    return [...new Set([normalizeJp(expr.kana), normalizeJp(expr.jp), ...variants.map(normalizeJp), ...readings])]
      .filter(Boolean);
  }

  /** Melhor nota entre as transcrições do reconhecimento de voz e as formas de uma expressão. */
  async scoreSpeech(transcripts: string[], expr: Speakable): Promise<number> {
    const forms = await this.expressionForms(expr);
    const heard = transcripts.map(normalizeJp);
    const heardReadings = await this.readingsOf(transcripts);
    let best = 0;
    for (const t of [...heard, ...heardReadings]) for (const f of forms) best = Math.max(best, similarity(t, f));
    return best;
  }

  /** Escolhe a opção mais parecida com o que foi dito. */
  async matchOption<O extends { expr: Speakable }>(transcripts: string[], options: O[], threshold = 0.7): Promise<MatchResult<O>> {
    const scored = await Promise.all(options.map(async (o) => ({ option: o, score: await this.scoreSpeech(transcripts, o.expr) })));
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    return { option: best.score >= threshold ? best.option : null, score: best.score, ranking: scored };
  }
}
