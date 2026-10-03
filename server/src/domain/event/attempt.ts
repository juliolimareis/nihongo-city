/** Uma resposta do jogador (voz ou clique) a um passo do cenário. */
export interface Attempt {
  readonly eventId: number;
  readonly stepId: number;
  readonly transcript: string;
  readonly optionId: number | null;
  readonly similarity: number | null;
  readonly correct: boolean;
}

const MAX_TRANSCRIPT = 200;

export const cleanTranscript = (value: unknown): string => String(value ?? '').slice(0, MAX_TRANSCRIPT);
