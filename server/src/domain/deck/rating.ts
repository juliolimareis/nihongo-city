import type { Rating, StudyMode } from '../../../../shared/contracts';
import { ValidationError } from '../shared/errors';

export type { Rating, StudyMode };

const RATINGS: readonly Rating[] = ['again', 'hard', 'good', 'easy'];
const MODES: readonly StudyMode[] = ['audio', 'read', 'write'];

export function parseRating(value: unknown): Rating {
  if (!RATINGS.includes(value as Rating)) throw new ValidationError('Avaliação inválida');
  return value as Rating;
}

export function parseStudyMode(value: unknown): StudyMode {
  if (!MODES.includes(value as StudyMode)) throw new ValidationError('Modo inválido');
  return value as StudyMode;
}
