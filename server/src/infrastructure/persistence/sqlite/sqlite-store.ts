import type { Db } from './connection';

/** Base dos adaptadores SQLite: subclasses podem preparar statements em inicializadores de campo. */
export abstract class SqliteStore {
  constructor(protected readonly db: Db) {}
}
