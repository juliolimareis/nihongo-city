import type { CardDto, CardFilter } from '../../../../shared/contracts';
import type { Card } from './card';
import type { DailyCount, DueCount, DueStage } from './daily-limit';
import type { Rating, StudyMode } from './rating';

export interface CardRepository {
  find(playerId: number, expressionId: string): Card | null;
  save(card: Card): void;
  /** Adiciona a carta se ainda não existir; devolve true se foi criada. */
  addIfMissing(playerId: number, expressionId: string): boolean;
  deleteAllFor(playerId: number): void;
}

export interface ReviewLogRepository {
  append(entry: { playerId: number; expressionId: string; mode: StudyMode; rating: Rating }): void;
  deleteAllFor(playerId: number): void;
}

/** Read model do baralho (carta + expressão + acertos/erros). */
export interface CardQuery {
  list(playerId: number, filter: CardFilter): CardDto[];
  /** Cartas vencidas de um estágio, das mais atrasadas para as mais recentes. `dayStart` separa "hoje" dos outros dias. */
  dueByStage(playerId: number, stage: DueStage, dayStart: Date, limit: number): CardDto[];
  countDue(playerId: number, dayStart: Date): DueCount;
  /** Cartas distintas estudadas desde `dayStart`: as que estrearam hoje e as que já vinham de outros dias. */
  studiedSince(playerId: number, dayStart: Date): DailyCount;
  one(playerId: number, expressionId: string): CardDto | null;
}
