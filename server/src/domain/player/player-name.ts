import { ValidationError } from '../shared/errors';

const MAX_LENGTH = 30;

/** Value object: o nome é a chave de "login" (um nome, um progresso). */
export class PlayerName {
  private constructor(readonly value: string) {}

  static parse(raw: unknown): PlayerName {
    const value = String(raw || '').trim().replace(/\s+/g, ' ').slice(0, MAX_LENGTH);
    if (!value) throw new ValidationError('Nome obrigatório');
    return new PlayerName(value);
  }
}
