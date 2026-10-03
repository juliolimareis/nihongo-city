import type { UnitOfWork } from '../../../application/ports';
import type { Db } from './connection';

export class SqliteUnitOfWork implements UnitOfWork {
  constructor(private readonly db: Db) {}

  run<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
}
