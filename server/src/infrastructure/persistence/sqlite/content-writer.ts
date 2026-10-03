import type { ContentWriter } from '../../../application/content/seed-content';
import type { ContentCatalog } from '../../../domain/content/catalog';
import type { Db } from './connection';

/** Upsert do catálogo de conteúdo nas tabelas do jogo. */
export class SqliteContentWriter implements ContentWriter {
  constructor(private readonly db: Db) {}

  write(data: ContentCatalog): void {
    const { db } = this;
    const upsertExpr = db.prepare(`
      INSERT INTO expressions (id, japanese, kana, romaji, portuguese, usage_pt, culture_note_pt,
                               politeness, category, source, variants, audio_file)
      VALUES (@id, @jp, @kana, @ro, @pt, @use, @culture, @pol, @cat, @source, @variants, @audio)
      ON CONFLICT(id) DO UPDATE SET
        japanese=excluded.japanese, kana=excluded.kana, romaji=excluded.romaji,
        portuguese=excluded.portuguese, usage_pt=excluded.usage_pt,
        culture_note_pt=excluded.culture_note_pt, politeness=excluded.politeness,
        category=excluded.category, source=excluded.source, variants=excluded.variants,
        audio_file=excluded.audio_file`);

    const upsertNpc = db.prepare(`
      INSERT INTO npcs (id, name_jp, name_pt, role_pt, image_file)
      VALUES (@id, @name_jp, @name_pt, @role_pt, @image_file)
      ON CONFLICT(id) DO UPDATE SET name_jp=excluded.name_jp, name_pt=excluded.name_pt,
        role_pt=excluded.role_pt, image_file=excluded.image_file`);

    const upsertScene = db.prepare(`
      INSERT INTO scenes (id, name_jp, name_pt, image_file, img_w, img_h, sort_order)
      VALUES (@id, @name_jp, @name_pt, @image_file, @img_w, @img_h, @sort_order)
      ON CONFLICT(id) DO UPDATE SET name_jp=excluded.name_jp, name_pt=excluded.name_pt,
        image_file=excluded.image_file, img_w=excluded.img_w, img_h=excluded.img_h,
        sort_order=excluded.sort_order`);

    const upsertLoc = db.prepare(`
      INSERT INTO locations (id, scene_id, name_jp, name_pt, icon, kind, x_pct, y_pct, w_pct, h_pct)
      VALUES (@id, @scene, @name_jp, @name_pt, @icon, @kind, @x, @y, @w, @h)
      ON CONFLICT(id) DO UPDATE SET scene_id=excluded.scene_id, name_jp=excluded.name_jp,
        name_pt=excluded.name_pt, icon=excluded.icon, kind=excluded.kind, x_pct=excluded.x_pct,
        y_pct=excluded.y_pct, w_pct=excluded.w_pct, h_pct=excluded.h_pct`);

    const upsertScenario = db.prepare(`
      INSERT INTO scenarios (id, kind, location_id, npc_id, title_pt, invite_text_pt, invite_text_jp,
                             culture_note_pt, farewell_expression_id, min_level)
      VALUES (@id, @kind, @location, @npc, @title, @invite_pt, @invite_jp, @culture, @farewell, @min_level)
      ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, location_id=excluded.location_id,
        npc_id=excluded.npc_id, title_pt=excluded.title_pt, invite_text_pt=excluded.invite_text_pt,
        invite_text_jp=excluded.invite_text_jp, culture_note_pt=excluded.culture_note_pt,
        farewell_expression_id=excluded.farewell_expression_id, min_level=excluded.min_level`);

    // Passos e opções são recriados; logs antigos que apontam para steps removidos perdem a referência.
    const deleteOptions = db.prepare(
      'DELETE FROM step_options WHERE step_id IN (SELECT id FROM scenario_steps WHERE scenario_id = ?)');
    const deleteSteps = db.prepare('DELETE FROM scenario_steps WHERE scenario_id = ?');
    const detachAttempts = db.prepare(`
      UPDATE attempt_log SET matched_option_id = NULL
      WHERE matched_option_id IN (SELECT o.id FROM step_options o JOIN scenario_steps s ON s.id = o.step_id WHERE s.scenario_id = ?)`);
    const insertStep = db.prepare(`
      INSERT INTO scenario_steps (scenario_id, step_key, step_order, npc_expression_id, prompt_pt)
      VALUES (?, ?, ?, ?, ?)`);
    const insertOpt = db.prepare(`
      INSERT INTO step_options (step_id, option_order, expression_id, is_correct, feedback_pt, next_step_key)
      VALUES (?, ?, ?, ?, ?, ?)`);

    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        for (const e of data.expressions) {
          upsertExpr.run({
            culture: '', source: 'custom', use: '', ...e,
            variants: JSON.stringify(e.variants || []),
            audio: e.audio_file || null,
          });
        }
        for (const n of data.npcs) upsertNpc.run({ image_file: `${n.id}.png`, ...n });
        for (const s of data.scenes) upsertScene.run({ ...s });
        for (const l of data.locations) upsertLoc.run({ ...l });
        for (const s of data.scenarios) {
          const { steps, ...scenario } = s;
          upsertScenario.run({ location: null, invite_pt: null, invite_jp: null, min_level: 1, ...scenario });
          detachAttempts.run(s.id);
          deleteOptions.run(s.id);
          deleteSteps.run(s.id);
          steps.forEach((st, i) => {
            const { lastInsertRowid: stepId } = insertStep.run(s.id, st.key, i, st.npc, st.prompt);
            st.options.forEach((o, j) =>
              insertOpt.run(stepId, j, o.expr, o.ok ? 1 : 0, o.fb || '', o.next || null));
          });
        }
        db.prepare('DELETE FROM step_options WHERE step_id NOT IN (SELECT id FROM scenario_steps)').run();
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  summary(): string {
    const count = (t: string): number => (this.db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
    const withAudio = (this.db.prepare('SELECT COUNT(*) c FROM expressions WHERE audio_file IS NOT NULL').get() as { c: number }).c;
    return `Seed OK: ${count('expressions')} expressões (${withAudio} com áudio), ${count('npcs')} NPCs, ` +
      `${count('scenes')} cenas, ${count('locations')} locais, ${count('scenarios')} cenários, ` +
      `${count('scenario_steps')} passos, ${count('step_options')} opções`;
  }
}
