import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema';

export type Db = Database.Database;

/**
 * Bancos criados antes do login por nome podem ter nomes repetidos, e o índice
 * único do schema falharia. Mantém o jogador mais antigo de cada nome e
 * renumera os outros ("Julio" → "Julio (2)"), sem apagar progresso de ninguém.
 */
function dedupePlayerNames(db: Db): void {
  const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'players'").get();
  if (!table) return;
  const dupes = db.prepare(`
    SELECT p.id, p.name FROM players p
    WHERE EXISTS (SELECT 1 FROM players o WHERE o.name = p.name COLLATE NOCASE AND o.id < p.id)
    ORDER BY p.id`).all() as { id: number; name: string }[];
  if (!dupes.length) return;
  const rename = db.prepare('UPDATE players SET name = ? WHERE id = ?');
  const taken = new Set((db.prepare('SELECT name FROM players').all() as { name: string }[]).map((r) => r.name.toLowerCase()));
  db.transaction(() => {
    for (const p of dupes) {
      let name: string;
      for (let n = 2; ; n++) {
        name = `${p.name} (${n})`.slice(0, 30);
        if (!taken.has(name.toLowerCase())) break;
      }
      taken.add(name.toLowerCase());
      rename.run(name, p.id);
      console.warn(`[db] nome repetido: jogador ${p.id} virou "${name}"`);
    }
  })();
}

export function openDatabase(file: string): Db {
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  dedupePlayerNames(db);
  db.exec(SCHEMA_SQL);
  return db;
}
