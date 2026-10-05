import type { InviteFrequency, SettingsDto } from '../../../../shared/contracts';

export type PlayerSettings = SettingsDto;
export type SettingsPatch = Partial<PlayerSettings>;

type Rule =
  | { kind: 'bool' }
  | { kind: 'range'; min: number; max: number; integer?: true }
  | { kind: 'enum'; values: readonly string[] }
  | { kind: 'scene' };

const INVITE_FREQUENCIES: readonly InviteFrequency[] = ['pouco', 'normal', 'muito'];

/** Limites aceitos para cada configuração; chaves desconhecidas são ignoradas. */
const RULES: Record<keyof PlayerSettings, Rule> = {
  music_on: { kind: 'bool' },
  music_volume: { kind: 'range', min: 0, max: 0.3 },
  sfx_on: { kind: 'bool' },
  sfx_volume: { kind: 'range', min: 0, max: 1 },
  voice_volume: { kind: 'range', min: 0.5, max: 1 },
  show_romaji: { kind: 'bool' },
  show_translation: { kind: 'bool' },
  text_speed: { kind: 'range', min: 10, max: 120 },
  current_scene: { kind: 'scene' },
  invites_on: { kind: 'bool' },
  invite_frequency: { kind: 'enum', values: INVITE_FREQUENCIES },
  daily_new_cards: { kind: 'range', min: 0, max: 50, integer: true },
  daily_reviews: { kind: 'range', min: 10, max: 200, integer: true },
};

export const BOOLEAN_SETTINGS = (Object.keys(RULES) as (keyof PlayerSettings)[])
  .filter((k) => RULES[k].kind === 'bool');

const isSettingKey = (key: string): key is keyof PlayerSettings => Object.prototype.hasOwnProperty.call(RULES, key);

/**
 * Política de domínio: filtra e limita um pedido de alteração.
 * Valores fora da faixa são presos aos limites; valores inválidos são descartados.
 */
export function sanitizeSettings(raw: unknown, sceneExists: (id: string) => boolean): SettingsPatch {
  const patch: Record<string, unknown> = {};
  if (!raw || typeof raw !== 'object') return patch;
  for (const [key, value] of Object.entries(raw)) {
    if (!isSettingKey(key)) continue;
    const rule = RULES[key];
    switch (rule.kind) {
      case 'bool':
        patch[key] = !!value;
        break;
      case 'scene':
        if (typeof value === 'string' && sceneExists(value)) patch[key] = value;
        break;
      case 'range': {
        const n = Number(value);
        if (Number.isFinite(n)) patch[key] = Math.min(rule.max, Math.max(rule.min, rule.integer ? Math.round(n) : n));
        break;
      }
      case 'enum':
        if (rule.values.includes(value as string)) patch[key] = value;
        break;
    }
  }
  return patch as SettingsPatch;
}
