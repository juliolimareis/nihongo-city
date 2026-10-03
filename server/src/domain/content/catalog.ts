import type { LocationKind } from './scene';
import type { ScenarioKind } from './scenario';

// Formato dos arquivos server/seed/*.json (fonte da verdade do conteúdo).

export interface ExpressionSeed {
  id: string;
  jp: string;
  kana: string;
  ro: string;
  pt: string;
  use?: string;
  culture?: string;
  pol: string;
  cat: string;
  source?: string;
  variants?: string[];
  audio_file?: string | null;
}

export interface NpcSeed {
  id: string;
  name_jp: string;
  name_pt: string;
  role_pt: string;
  image_file?: string;
}

export interface SceneSeed {
  id: string;
  name_jp: string;
  name_pt: string;
  image_file: string;
  img_w: number;
  img_h: number;
  sort_order: number;
}

export interface LocationSeed {
  id: string;
  scene: string;
  name_jp: string;
  name_pt: string;
  icon: string;
  kind: LocationKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OptionSeed {
  expr: string;
  ok?: boolean;
  fb?: string;
  next?: string;
}

export interface StepSeed {
  key: string;
  npc: string;
  prompt: string;
  options: OptionSeed[];
}

export interface ScenarioSeed {
  id: string;
  kind: ScenarioKind;
  location?: string | null;
  npc: string;
  title: string;
  invite_pt?: string | null;
  invite_jp?: string | null;
  culture: string;
  farewell: string;
  min_level?: number;
  steps: StepSeed[];
}

export interface ContentCatalog {
  expressions: ExpressionSeed[];
  npcs: NpcSeed[];
  scenes: SceneSeed[];
  locations: LocationSeed[];
  scenarios: ScenarioSeed[];
}

/** Confere as referências cruzadas do catálogo; devolve a lista de problemas (vazia = ok). */
export function validateCatalog({ expressions, npcs, scenes, locations, scenarios }: ContentCatalog): string[] {
  const exprIds = new Set(expressions.map((e) => e.id));
  const npcIds = new Set(npcs.map((n) => n.id));
  const sceneIds = new Set(scenes.map((s) => s.id));
  const locIds = new Set(locations.map((l) => l.id));
  const errors: string[] = [];

  for (const l of locations) if (!sceneIds.has(l.scene)) errors.push(`local ${l.id}: cena ${l.scene} inexistente`);
  for (const s of scenarios) {
    if (!npcIds.has(s.npc)) errors.push(`${s.id}: npc ${s.npc} inexistente`);
    if (s.kind === 'location' && !locIds.has(s.location ?? '')) errors.push(`${s.id}: local ${s.location} inexistente`);
    if (!exprIds.has(s.farewell)) errors.push(`${s.id}: despedida ${s.farewell} inexistente`);
    const keys = new Set(s.steps.map((st) => st.key));
    for (const st of s.steps) {
      if (!exprIds.has(st.npc)) errors.push(`${s.id}/${st.key}: fala ${st.npc} inexistente`);
      if (!st.options.some((o) => o.ok)) errors.push(`${s.id}/${st.key}: nenhuma opção correta`);
      for (const o of st.options) {
        if (!exprIds.has(o.expr)) errors.push(`${s.id}/${st.key}: opção ${o.expr} inexistente`);
        if (o.next && !keys.has(o.next)) errors.push(`${s.id}/${st.key}: next ${o.next} inexistente`);
      }
    }
  }
  return errors;
}
