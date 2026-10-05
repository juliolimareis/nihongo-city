import type { DueCardsResponse } from '../../../../shared/contracts';
import type { PlayerRepository } from '../../domain/player/repositories';
import { requirePlayer } from '../player/require-player';
import type { StudyDay } from './study-day';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ListDueCards {
  constructor(private readonly players: PlayerRepository, private readonly studyDay: StudyDay) {}

  execute(playerId: unknown, rawLimit: unknown): DueCardsResponse {
    const { id } = requirePlayer(this.players, playerId);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(rawLimit) || DEFAULT_LIMIT));
    return this.studyDay.queue(id, limit);
  }
}
