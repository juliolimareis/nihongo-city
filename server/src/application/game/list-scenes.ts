import type { SceneDto } from '../../../../shared/contracts';
import type { SceneRepository } from '../../domain/content/repositories';
import { toSceneDto } from '../mappers';

export class ListScenes {
  constructor(private readonly scenes: SceneRepository) {}

  execute(): SceneDto[] {
    return this.scenes.listWithLocations().map(toSceneDto);
  }
}
