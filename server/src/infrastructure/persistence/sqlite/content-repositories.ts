import type { Expression } from '../../../domain/content/expression';
import type { Npc } from '../../../domain/content/npc';
import type {
  ExpressionRepository, LocationRepository, NpcRepository, SceneRepository, ScenarioRepository,
} from '../../../domain/content/repositories';
import type { Location, LocationKind, Scene } from '../../../domain/content/scene';
import { Scenario, type ScenarioKind } from '../../../domain/content/scenario';
import { SqliteStore } from './sqlite-store';

interface ExpressionRow {
  id: string; japanese: string; kana: string; romaji: string; portuguese: string; usage_pt: string;
  culture_note_pt: string; politeness: string; category: string; source: string; variants: string;
  audio_file: string | null;
}

export const toExpression = (r: ExpressionRow): Expression => ({
  id: r.id, japanese: r.japanese, kana: r.kana, romaji: r.romaji, portuguese: r.portuguese,
  usage: r.usage_pt, cultureNote: r.culture_note_pt, politeness: r.politeness, category: r.category,
  source: r.source, variants: JSON.parse(r.variants) as string[], audioFile: r.audio_file,
});

export class SqliteExpressionRepository extends SqliteStore implements ExpressionRepository {
  private readonly byId = this.db.prepare('SELECT * FROM expressions WHERE id = ?');

  findById(id: string): Expression | null {
    const row = this.byId.get(id) as ExpressionRow | undefined;
    return row ? toExpression(row) : null;
  }

  findByIds(ids: readonly string[]): Map<string, Expression> {
    const out = new Map<string, Expression>();
    for (const id of new Set(ids)) {
      const e = this.findById(id);
      if (e) out.set(id, e);
    }
    return out;
  }
}

interface NpcRow { id: string; name_jp: string; name_pt: string; role_pt: string; image_file: string }

export class SqliteNpcRepository extends SqliteStore implements NpcRepository {
  private readonly byId = this.db.prepare('SELECT * FROM npcs WHERE id = ?');

  findById(id: string): Npc | null {
    const r = this.byId.get(id) as NpcRow | undefined;
    return r ? { id: r.id, nameJp: r.name_jp, namePt: r.name_pt, role: r.role_pt, imageFile: r.image_file } : null;
  }
}

interface LocationRow {
  id: string; scene_id: string; name_jp: string; name_pt: string; icon: string; kind: LocationKind;
  x_pct: number; y_pct: number; w_pct: number; h_pct: number;
}

const toLocation = (l: LocationRow): Location => ({
  id: l.id, sceneId: l.scene_id, nameJp: l.name_jp, namePt: l.name_pt, icon: l.icon, kind: l.kind,
  x: l.x_pct, y: l.y_pct, w: l.w_pct, h: l.h_pct,
});

interface SceneRow {
  id: string; name_jp: string; name_pt: string; image_file: string; img_w: number; img_h: number; sort_order: number;
}

export class SqliteSceneRepository extends SqliteStore implements SceneRepository {
  private readonly all = this.db.prepare('SELECT * FROM scenes ORDER BY sort_order');
  private readonly locations = this.db.prepare('SELECT * FROM locations WHERE scene_id = ? ORDER BY y_pct');
  private readonly one = this.db.prepare('SELECT 1 FROM scenes WHERE id = ?');

  listWithLocations(): Scene[] {
    return (this.all.all() as SceneRow[]).map((s) => ({
      id: s.id, nameJp: s.name_jp, namePt: s.name_pt, imageFile: s.image_file,
      width: s.img_w, height: s.img_h, sortOrder: s.sort_order,
      locations: (this.locations.all(s.id) as LocationRow[]).map(toLocation),
    }));
  }

  exists(id: string): boolean {
    return !!this.one.get(id);
  }
}

export class SqliteLocationRepository extends SqliteStore implements LocationRepository {
  private readonly byId = this.db.prepare('SELECT * FROM locations WHERE id = ?');

  findById(id: string): Location | null {
    const row = this.byId.get(id) as LocationRow | undefined;
    return row ? toLocation(row) : null;
  }
}

interface ScenarioRow {
  id: string; kind: ScenarioKind; location_id: string | null; npc_id: string; title_pt: string;
  invite_text_pt: string | null; invite_text_jp: string | null; culture_note_pt: string;
  farewell_expression_id: string; min_level: number;
}
interface StepRow { id: number; step_key: string; step_order: number; npc_expression_id: string; prompt_pt: string }
interface OptionRow {
  id: number; option_order: number; expression_id: string; is_correct: number; feedback_pt: string;
  next_step_key: string | null;
}

export class SqliteScenarioRepository extends SqliteStore implements ScenarioRepository {
  private readonly byId = this.db.prepare('SELECT * FROM scenarios WHERE id = ?');
  private readonly steps = this.db.prepare('SELECT * FROM scenario_steps WHERE scenario_id = ? ORDER BY step_order');
  private readonly options = this.db.prepare('SELECT * FROM step_options WHERE step_id = ? ORDER BY option_order');
  private readonly invites = this.db.prepare("SELECT id FROM scenarios WHERE kind = 'invite' AND min_level <= ?");
  private readonly forLocation = this.db.prepare('SELECT id FROM scenarios WHERE location_id = ? AND min_level <= ?');

  findById(id: string): Scenario | null {
    const s = this.byId.get(id) as ScenarioRow | undefined;
    if (!s) return null;
    return new Scenario({
      id: s.id, kind: s.kind, locationId: s.location_id, npcId: s.npc_id, title: s.title_pt,
      inviteTextPt: s.invite_text_pt, inviteTextJp: s.invite_text_jp, cultureNote: s.culture_note_pt,
      farewellExpressionId: s.farewell_expression_id, minLevel: s.min_level,
      steps: (this.steps.all(s.id) as StepRow[]).map((st) => ({
        id: st.id, key: st.step_key, order: st.step_order, npcExpressionId: st.npc_expression_id, prompt: st.prompt_pt,
        options: (this.options.all(st.id) as OptionRow[]).map((o) => ({
          id: o.id, order: o.option_order, expressionId: o.expression_id, correct: !!o.is_correct,
          feedback: o.feedback_pt, nextStepKey: o.next_step_key,
        })),
      })),
    });
  }

  listInviteIds(maxLevel: number): string[] {
    return (this.invites.all(maxLevel) as { id: string }[]).map((r) => r.id);
  }

  listIdsForLocation(locationId: string, maxLevel: number): string[] {
    return (this.forLocation.all(locationId, maxLevel) as { id: string }[]).map((r) => r.id);
  }
}
