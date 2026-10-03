import type { Expression } from './expression';
import type { Npc } from './npc';
import type { Location, Scene } from './scene';
import type { Scenario } from './scenario';

// Portas de saída do contexto de conteúdo (somente leitura em tempo de jogo).

export interface ExpressionRepository {
  findById(id: string): Expression | null;
  findByIds(ids: readonly string[]): Map<string, Expression>;
}

export interface NpcRepository {
  findById(id: string): Npc | null;
}

export interface SceneRepository {
  listWithLocations(): Scene[];
  exists(id: string): boolean;
}

export interface LocationRepository {
  findById(id: string): Location | null;
}

export interface ScenarioRepository {
  findById(id: string): Scenario | null;
  /** Convites liberados para o nível do jogador. */
  listInviteIds(maxLevel: number): string[];
  /** Cenários de um local liberados para o nível do jogador. */
  listIdsForLocation(locationId: string, maxLevel: number): string[];
}
