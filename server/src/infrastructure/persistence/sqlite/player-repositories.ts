import type { StatsDto } from '../../../../../shared/contracts';
import { Player } from '../../../domain/player/player';
import type { PlayerName } from '../../../domain/player/player-name';
import type { PlayerRepository, PlayerStatsQuery, SettingsRepository } from '../../../domain/player/repositories';
import { BOOLEAN_SETTINGS, type PlayerSettings, type SettingsPatch } from '../../../domain/player/settings';
import { SqliteStore } from './sqlite-store';

interface PlayerRow { id: number; name: string; level: number; xp: number; created_at: string }

const toPlayer = (r: PlayerRow): Player =>
  Player.restore({ id: r.id, name: r.name, level: r.level, xp: r.xp, createdAt: r.created_at });

export class SqlitePlayerRepository extends SqliteStore implements PlayerRepository {
  private readonly byId = this.db.prepare('SELECT * FROM players WHERE id = ?');
  private readonly byName = this.db.prepare('SELECT * FROM players WHERE name = ? COLLATE NOCASE');
  private readonly insert = this.db.prepare('INSERT INTO players (name) VALUES (?)');
  private readonly update = this.db.prepare('UPDATE players SET xp = @xp, level = @level WHERE id = @id');

  findById(id: number): Player | null {
    const row = this.byId.get(id) as PlayerRow | undefined;
    return row ? toPlayer(row) : null;
  }

  findByName(name: PlayerName): Player | null {
    const row = this.byName.get(name.value) as PlayerRow | undefined;
    return row ? toPlayer(row) : null;
  }

  create(name: PlayerName): Player {
    const { lastInsertRowid } = this.insert.run(name.value);
    return toPlayer(this.byId.get(lastInsertRowid) as PlayerRow);
  }

  save(player: Player): void {
    const { id, xp, level } = player.snapshot();
    this.update.run({ id, xp, level });
  }
}

type SettingsRow = Record<keyof PlayerSettings, unknown> & { player_id: number };

export class SqliteSettingsRepository extends SqliteStore implements SettingsRepository {
  private readonly select = this.db.prepare('SELECT * FROM player_settings WHERE player_id = ?');
  private readonly insert = this.db.prepare('INSERT INTO player_settings (player_id) VALUES (?)');

  createDefaults(playerId: number): void {
    this.insert.run(playerId);
  }

  get(playerId: number): PlayerSettings {
    const { player_id: _, ...row } = this.select.get(playerId) as SettingsRow;
    const settings: Record<string, unknown> = row;
    for (const key of BOOLEAN_SETTINGS) settings[key] = !!settings[key];
    return settings as unknown as PlayerSettings;
  }

  update(playerId: number, patch: SettingsPatch): void {
    // As chaves já foram filtradas pela política de domínio; só colunas conhecidas chegam aqui.
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) values[k] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
    const keys = Object.keys(values);
    if (!keys.length) return;
    this.db.prepare(`UPDATE player_settings SET ${keys.map((k) => `${k} = @${k}`).join(', ')} WHERE player_id = @id`)
      .run({ ...values, id: playerId });
  }
}

export class SqlitePlayerStatsQuery extends SqliteStore implements PlayerStatsQuery {
  private readonly query = this.db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM player_cards WHERE player_id = @p) AS cards,
      (SELECT COUNT(*) FROM player_cards WHERE player_id = @p AND due_at <= datetime('now')) AS due,
      (SELECT COUNT(*) FROM event_log WHERE player_id = @p AND outcome IS NOT NULL) AS events,
      (SELECT COUNT(*) FROM event_log WHERE player_id = @p AND outcome = 'success') AS successes`);

  statsFor(playerId: number): StatsDto {
    return this.query.get({ p: playerId }) as StatsDto;
  }
}
