import { SeedContent } from '../application/content/seed-content';
import { ValidationError } from '../domain/shared/errors';
import { config } from '../infrastructure/config';
import { openDatabase } from '../infrastructure/persistence/sqlite/connection';
import { SqliteContentWriter } from '../infrastructure/persistence/sqlite/content-writer';
import { JsonContentSource } from '../infrastructure/seed/json-content-source';

// npm run seed: server/seed/*.json → SQLite.
try {
  const db = openDatabase(config.dbFile);
  console.log(new SeedContent(new JsonContentSource(config.seedDir), new SqliteContentWriter(db)).execute());
  db.close();
} catch (err) {
  console.error(err instanceof ValidationError ? err.message : err);
  process.exit(1);
}
