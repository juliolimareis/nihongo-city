import type { ExpressionDto, NpcDto, PlayerDto, SceneDto } from '../../../shared/contracts';
import type { Expression } from '../domain/content/expression';
import type { Npc } from '../domain/content/npc';
import type { Scene } from '../domain/content/scene';
import type { Player } from '../domain/player/player';
import { npcImageUrl, sceneImageUrl, voiceUrl } from './assets';

export function toExpressionDto(e: Expression): ExpressionDto {
  return {
    id: e.id, jp: e.japanese, kana: e.kana, romaji: e.romaji, pt: e.portuguese,
    usage: e.usage, politeness: e.politeness, category: e.category,
    variants: [...e.variants], audio: voiceUrl(e.audioFile),
  };
}

export function toNpcDto(n: Npc): NpcDto {
  return { id: n.id, nameJp: n.nameJp, namePt: n.namePt, image: npcImageUrl(n.imageFile) };
}

export function toSceneDto(s: Scene): SceneDto {
  return {
    id: s.id, nameJp: s.nameJp, namePt: s.namePt, image: sceneImageUrl(s.imageFile),
    width: s.width, height: s.height,
    locations: s.locations.map((l) => ({
      id: l.id, nameJp: l.nameJp, namePt: l.namePt, icon: l.icon, kind: l.kind,
      x: l.x, y: l.y, w: l.w, h: l.h,
    })),
  };
}

export function toPlayerDto(p: Player): PlayerDto {
  return { id: p.id, name: p.name, level: p.level, xp: p.xp, createdAt: p.createdAt };
}
