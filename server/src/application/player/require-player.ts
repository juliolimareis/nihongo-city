import type { Player } from '../../domain/player/player';
import type { PlayerRepository } from '../../domain/player/repositories';
import { NotFoundError } from '../../domain/shared/errors';

export function requirePlayer(players: PlayerRepository, rawId: unknown): Player {
  const player = players.findById(Number(rawId));
  if (!player) throw new NotFoundError('Jogador não encontrado');
  return player;
}
