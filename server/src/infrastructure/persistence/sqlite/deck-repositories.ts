import type { CardDto, CardFilter } from '../../../../../shared/contracts';
import { voiceUrl } from '../../../application/assets';
import { Card } from '../../../domain/deck/card';
import type { DailyCount, DueCount, DueStage } from '../../../domain/deck/daily-limit';
import type { Rating, StudyMode } from '../../../domain/deck/rating';
import type { CardQuery, CardRepository, ReviewLogRepository } from '../../../domain/deck/repositories';
import { SqliteStore } from './sqlite-store';
import { fromSqlDate, toSqlDate } from './dates';

interface CardRow {
  player_id: number; expression_id: string; added_at: string; ease: number; interval_days: number;
  repetitions: number; lapses: number; due_at: string;
}

export class SqliteCardRepository extends SqliteStore implements CardRepository {
  private readonly one = this.db.prepare('SELECT * FROM player_cards WHERE player_id = ? AND expression_id = ?');
  private readonly update = this.db.prepare(`
    UPDATE player_cards SET ease = @ease, interval_days = @interval_days, repetitions = @repetitions,
      lapses = @lapses, due_at = @due_at
    WHERE player_id = @player AND expression_id = @expr`);
  private readonly insert = this.db.prepare('INSERT OR IGNORE INTO player_cards (player_id, expression_id) VALUES (?, ?)');
  private readonly deleteAll = this.db.prepare('DELETE FROM player_cards WHERE player_id = ?');

  find(playerId: number, expressionId: string): Card | null {
    const r = this.one.get(playerId, expressionId) as CardRow | undefined;
    if (!r) return null;
    return Card.restore({
      playerId: r.player_id, expressionId: r.expression_id, ease: r.ease, intervalDays: r.interval_days,
      repetitions: r.repetitions, lapses: r.lapses, dueAt: fromSqlDate(r.due_at),
    });
  }

  save(card: Card): void {
    const c = card.snapshot();
    this.update.run({
      ease: c.ease, interval_days: c.intervalDays, repetitions: c.repetitions, lapses: c.lapses,
      due_at: toSqlDate(c.dueAt), player: c.playerId, expr: c.expressionId,
    });
  }

  addIfMissing(playerId: number, expressionId: string): boolean {
    return this.insert.run(playerId, expressionId).changes > 0;
  }

  deleteAllFor(playerId: number): void {
    this.deleteAll.run(playerId);
  }
}

export class SqliteReviewLogRepository extends SqliteStore implements ReviewLogRepository {
  private readonly insert = this.db.prepare(
    'INSERT INTO review_log (player_id, expression_id, mode, rating) VALUES (?, ?, ?, ?)');
  private readonly deleteAll = this.db.prepare('DELETE FROM review_log WHERE player_id = ?');

  append(e: { playerId: number; expressionId: string; mode: StudyMode; rating: Rating }): void {
    this.insert.run(e.playerId, e.expressionId, e.mode, e.rating);
  }

  deleteAllFor(playerId: number): void {
    this.deleteAll.run(playerId);
  }
}

const CARD_SELECT = `
  SELECT c.*, e.japanese, e.kana, e.romaji, e.portuguese, e.usage_pt, e.culture_note_pt,
         e.politeness, e.category, e.variants, e.audio_file,
         (SELECT COUNT(*) FROM review_log r WHERE r.player_id = c.player_id AND r.expression_id = c.expression_id
            AND r.rating != 'again') AS hits,
         (SELECT COUNT(*) FROM review_log r WHERE r.player_id = c.player_id AND r.expression_id = c.expression_id
            AND r.rating = 'again') AS misses
  FROM player_cards c JOIN expressions e ON e.id = c.expression_id`;

interface CardViewRow extends CardRow {
  japanese: string; kana: string; romaji: string; portuguese: string; usage_pt: string; culture_note_pt: string;
  politeness: string; category: string; variants: string; audio_file: string | null; hits: number; misses: number;
}

const toCardDto = (r: CardViewRow): CardDto => ({
  id: r.expression_id, jp: r.japanese, kana: r.kana, romaji: r.romaji, pt: r.portuguese,
  usage: r.usage_pt, culture: r.culture_note_pt, politeness: r.politeness, category: r.category,
  variants: JSON.parse(r.variants) as string[], audio: voiceUrl(r.audio_file),
  addedAt: r.added_at, dueAt: r.due_at, intervalDays: r.interval_days, repetitions: r.repetitions,
  lapses: r.lapses, hits: r.hits, misses: r.misses,
});

const REVIEWED = 'SELECT 1 FROM review_log r WHERE r.player_id = c.player_id AND r.expression_id = c.expression_id';

/** Estágio (DueStage) de uma carta `c`, a partir do histórico de revisões. */
const STAGE_SQL = `CASE
  WHEN EXISTS (${REVIEWED} AND r.reviewed_at >= @dayStart) THEN 'learning'
  WHEN EXISTS (${REVIEWED}) THEN 'review'
  ELSE 'new' END`;

export class SqliteCardQuery extends SqliteStore implements CardQuery {
  private readonly dueStmt = this.db.prepare(`${CARD_SELECT}
    WHERE c.player_id = @player AND c.due_at <= datetime('now') AND ${STAGE_SQL} = @stage
    ORDER BY c.due_at LIMIT @limit`);
  private readonly countDueStmt = this.db.prepare(`
    SELECT ${STAGE_SQL} AS stage, COUNT(*) AS n FROM player_cards c
    WHERE c.player_id = @player AND c.due_at <= datetime('now') GROUP BY stage`);
  private readonly studiedStmt = this.db.prepare(`
    SELECT COALESCE(SUM(first_at >= @dayStart), 0) AS newCards, COALESCE(SUM(first_at < @dayStart), 0) AS reviews
    FROM (SELECT MIN(reviewed_at) AS first_at FROM review_log WHERE player_id = @player
          GROUP BY expression_id HAVING MAX(reviewed_at) >= @dayStart)`);
  private readonly oneStmt = this.db.prepare(`${CARD_SELECT} WHERE c.player_id = ? AND c.expression_id = ?`);

  list(playerId: number, filter: CardFilter): CardDto[] {
    const where = ['c.player_id = @player'];
    const params: Record<string, unknown> = { player: playerId };
    if (filter.category) { where.push('e.category = @category'); params.category = filter.category; }
    if (filter.due === '1') where.push("c.due_at <= datetime('now')");
    if (filter.q) {
      where.push('(e.japanese LIKE @q OR e.kana LIKE @q OR e.romaji LIKE @q OR e.portuguese LIKE @q)');
      params.q = `%${filter.q}%`;
    }
    const rows = this.db.prepare(`${CARD_SELECT} WHERE ${where.join(' AND ')} ORDER BY c.added_at DESC, e.japanese`)
      .all(params) as CardViewRow[];
    return rows.map(toCardDto);
  }

  dueByStage(playerId: number, stage: DueStage, dayStart: Date, limit: number): CardDto[] {
    if (limit <= 0) return [];
    const rows = this.dueStmt.all({ player: playerId, stage, dayStart: toSqlDate(dayStart), limit }) as CardViewRow[];
    return rows.map(toCardDto);
  }

  countDue(playerId: number, dayStart: Date): DueCount {
    const rows = this.countDueStmt.all({ player: playerId, dayStart: toSqlDate(dayStart) }) as { stage: DueStage; n: number }[];
    const count: Record<DueStage, number> = { learning: 0, review: 0, new: 0 };
    for (const r of rows) count[r.stage] = r.n;
    return count;
  }

  studiedSince(playerId: number, dayStart: Date): DailyCount {
    return this.studiedStmt.get({ player: playerId, dayStart: toSqlDate(dayStart) }) as DailyCount;
  }

  one(playerId: number, expressionId: string): CardDto | null {
    const row = this.oneStmt.get(playerId, expressionId) as CardViewRow | undefined;
    return row ? toCardDto(row) : null;
  }
}
