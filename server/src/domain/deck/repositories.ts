import type { CardDto, CardFilter } from '../../../../shared/contracts';
import type { Card } from './card';
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
  due(playerId: number, limit: number): CardDto[];
  one(playerId: number, expressionId: string): CardDto | null;
}
