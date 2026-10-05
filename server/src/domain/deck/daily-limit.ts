/** Em que ponto do aprendizado uma carta vencida está, para efeito do limite diário. */
export type DueStage =
  | 'learning'  // já estudada hoje e venceu de novo ("Errei"): não consome limite
  | 'review'    // estudada em outro dia
  | 'new';      // nunca estudada

/** Quantidades por tipo de carta que consome o limite diário. */
export interface DailyCount {
  readonly newCards: number;
  readonly reviews: number;
}

export type DueCount = Readonly<Record<DueStage, number>>;

/** O dia de estudo vira à meia-noite do relógio local. */
export function startOfDay(now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Quanto do limite ainda pode ser usado hoje. */
export function remainingToday(limits: DailyCount, done: DailyCount): DailyCount {
  return {
    newCards: Math.max(0, limits.newCards - done.newCards),
    reviews: Math.max(0, limits.reviews - done.reviews),
  };
}

/** Das cartas vencidas, quantas de cada tipo cabem no que resta do limite. */
export function allowedToday(due: DueCount, remaining: DailyCount): DueCount {
  return {
    learning: due.learning,
    review: Math.min(due.review, remaining.reviews),
    new: Math.min(due.new, remaining.newCards),
  };
}
