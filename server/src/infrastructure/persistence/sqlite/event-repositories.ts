import type { Attempt } from '../../../domain/event/attempt';
import { type EventSource, GameEvent, type Outcome } from '../../../domain/event/game-event';
import type { AttemptRepository, GameEventRepository } from '../../../domain/event/repositories';
import { SqliteStore } from './sqlite-store';
import { fromSqlDate, toSqlDate } from './dates';

interface EventRow {
  id: number; player_id: number; scenario_id: string; mistakes: number;
  outcome: Outcome | null; finished_at: string | null;
}

export class SqliteGameEventRepository extends SqliteStore implements GameEventRepository {
  private readonly insert = this.db.prepare('INSERT INTO event_log (player_id, scenario_id, source) VALUES (?, ?, ?)');
  private readonly open = this.db.prepare('SELECT * FROM event_log WHERE id = ? AND finished_at IS NULL');
  private readonly update = this.db.prepare(
    'UPDATE event_log SET mistakes = @mistakes, outcome = @outcome, finished_at = @finished_at WHERE id = @id');
  private readonly last = this.db.prepare('SELECT scenario_id FROM event_log WHERE player_id = ? ORDER BY id DESC LIMIT 1');
  private readonly count = this.db.prepare('SELECT COUNT(*) c FROM event_log WHERE player_id = ? AND scenario_id = ?');
  private readonly deleteAll = this.db.prepare('DELETE FROM event_log WHERE player_id = ?');

  start(playerId: number, scenarioId: string, source: EventSource): number {
    return Number(this.insert.run(playerId, scenarioId, source).lastInsertRowid);
  }

  findOpen(id: number): GameEvent | null {
    const r = this.open.get(id) as EventRow | undefined;
    if (!r) return null;
    return GameEvent.restore({
      id: r.id, playerId: r.player_id, scenarioId: r.scenario_id, mistakes: r.mistakes,
      outcome: r.outcome, finishedAt: r.finished_at ? fromSqlDate(r.finished_at) : null,
    });
  }

  save(event: GameEvent): void {
    const e = event.snapshot();
    this.update.run({
      id: e.id, mistakes: e.mistakes, outcome: e.outcome, finished_at: e.finishedAt ? toSqlDate(e.finishedAt) : null,
    });
  }

  lastScenarioId(playerId: number): string | null {
    const row = this.last.get(playerId) as { scenario_id: string } | undefined;
    return row?.scenario_id ?? null;
  }

  playCount(playerId: number, scenarioId: string): number {
    return (this.count.get(playerId, scenarioId) as { c: number }).c;
  }

  deleteAllFor(playerId: number): void {
    this.deleteAll.run(playerId);
  }
}

export class SqliteAttemptRepository extends SqliteStore implements AttemptRepository {
  private readonly insert = this.db.prepare(`
    INSERT INTO attempt_log (event_id, step_id, transcript, matched_option_id, similarity, correct)
    VALUES (@eventId, @stepId, @transcript, @optionId, @similarity, @correct)`);
  private readonly correct = this.db.prepare(
    'SELECT matched_option_id o FROM attempt_log WHERE event_id = ? AND correct = 1 AND matched_option_id IS NOT NULL ORDER BY id');

  add(a: Attempt): void {
    this.insert.run({ ...a, correct: a.correct ? 1 : 0 });
  }

  correctOptionIds(eventId: number): number[] {
    return (this.correct.all(eventId) as { o: number }[]).map((r) => r.o);
  }
}
