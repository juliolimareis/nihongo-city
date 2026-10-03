/** Uma frase em japonês com leitura, tradução e áudio. */
export interface Expression {
  readonly id: string;
  readonly japanese: string;
  readonly kana: string;
  readonly romaji: string;
  readonly portuguese: string;
  readonly usage: string;
  readonly cultureNote: string;
  /** casual | polido | keigo */
  readonly politeness: string;
  readonly category: string;
  /** pdf | anki | custom */
  readonly source: string;
  /** Grafias/leituras aceitas no reconhecimento de voz. */
  readonly variants: readonly string[];
  readonly audioFile: string | null;
}
