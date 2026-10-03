/**
 * Contrato HTTP/SSE entre servidor e navegador (TV e celular).
 * Só tipos: nenhum código daqui vai para o bundle ou para o runtime do servidor.
 */

// ===== Conteúdo =====

export interface ExpressionDto {
  id: string;
  jp: string;
  kana: string;
  romaji: string;
  pt: string;
  usage: string;
  politeness: string;
  category: string;
  variants: string[];
  audio: string | null;
}

export interface NpcDto {
  id: string;
  nameJp: string;
  namePt: string;
  image: string;
}

export type LocationKind = 'place' | 'street' | 'signpost';

export interface LocationDto {
  id: string;
  nameJp: string;
  namePt: string;
  icon: string;
  kind: LocationKind;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SceneDto {
  id: string;
  nameJp: string;
  namePt: string;
  image: string;
  width: number;
  height: number;
  locations: LocationDto[];
}

export interface OptionDto {
  id: number;
  correct: boolean;
  feedback: string;
  next: string | null;
  expr: ExpressionDto;
}

export interface StepDto {
  id: number;
  key: string;
  prompt: string;
  npc: ExpressionDto;
  options: OptionDto[];
}

export type ScenarioKind = 'location' | 'invite';

export interface ScenarioDto {
  id: string;
  kind: ScenarioKind;
  title: string;
  culture: string;
  npc: NpcDto;
  farewell: ExpressionDto;
  steps: StepDto[];
}

// ===== Jogador =====

export interface PlayerDto {
  id: number;
  name: string;
  level: number;
  xp: number;
  createdAt: string;
}

export type InviteFrequency = 'pouco' | 'normal' | 'muito';

/** Chaves em snake_case: são as mesmas colunas de player_settings. */
export interface SettingsDto {
  music_on: boolean;
  music_volume: number;
  sfx_on: boolean;
  sfx_volume: number;
  voice_volume: number;
  show_romaji: boolean;
  show_translation: boolean;
  text_speed: number;
  current_scene: string;
  invites_on: boolean;
  invite_frequency: InviteFrequency;
}

export interface StatsDto {
  cards: number;
  due: number;
  events: number;
  successes: number;
}

export interface ProfileDto {
  player: PlayerDto;
  settings: SettingsDto;
  stats: StatsDto;
}

export interface LoginResponse extends ProfileDto {
  returning: boolean;
}

// ===== Baralho =====

export type Rating = 'again' | 'hard' | 'good' | 'easy';
export type StudyMode = 'audio' | 'read' | 'write';

export interface CardDto {
  id: string;
  jp: string;
  kana: string;
  romaji: string;
  pt: string;
  usage: string;
  culture: string;
  politeness: string;
  category: string;
  variants: string[];
  audio: string | null;
  addedAt: string;
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  lapses: number;
  hits: number;
  misses: number;
}

export interface CardFilter {
  q?: string;
  category?: string;
  due?: '1';
}

export interface ReviewRequest {
  player: number;
  mode: StudyMode;
  rating: Rating;
}

// ===== Eventos =====

export type EventSource = 'click' | 'invite';
export type Outcome = 'success' | 'failed' | 'abandoned';

export interface StartEventRequest {
  player: number;
  locationId?: string;
  scenarioId?: string;
  source?: EventSource;
}

export interface StartEventResponse {
  eventId: number;
  scenario: ScenarioDto;
}

export interface AttemptRequest {
  stepId: number;
  optionId: number | null;
  transcript: string;
  similarity: number;
}

export interface AttemptResponse {
  correct: boolean;
}

export interface FinishEventRequest {
  outcome: Outcome;
  seenStepIds: number[];
}

export interface FinishEventResponse {
  xpGain: number;
  xp: number;
  level: number;
  newCards: ExpressionDto[];
}

export interface InviteDto {
  scenarioId: string;
  title: string;
  textPt: string | null;
  textJp: string | null;
  npc: NpcDto;
}

export interface ReadingResponse {
  readings: string[];
}

// ===== Celular como microfone =====

export interface PairingDto {
  code: string;
  url: string;
  qr: string;
  alternatives: string[];
}

export interface RemoteResult {
  ok: boolean;
  title: string;
  said?: string | null;
  message?: string | null;
}

export interface RemoteOption {
  jp: string;
  romaji: string;
  audio: string | null;
}

/** O que a TV está mostrando, espelhado no celular. */
export type RemoteScreen =
  | { mode: 'idle' }
  | { mode: 'npc'; npc: string; jp: string; romaji: string; pt: string; canContinue: boolean }
  | { mode: 'answer'; prompt: string; options: RemoteOption[]; lives: number; result: RemoteResult | null }
  | { mode: 'repeat'; audio: string | null }
  | { mode: 'result'; result: RemoteResult; canContinue?: boolean }
  | { mode: 'ending'; title: string; xp: number; cards: string[]; culture: string; canContinue: boolean };

/** Estado publicado; `listenId` aparece quando a TV espera uma fala. */
export type RemoteState = RemoteScreen & { listenId?: number };

export type RemoteAction = 'continue' | 'replay';

/** Mensagens SSE que a TV recebe. */
export type TvMessage =
  | { type: 'phone'; connected: boolean }
  | { type: 'speech'; transcripts: string[]; listenId: number | null }
  | { type: 'action'; action: RemoteAction };

/** Mensagens SSE que o celular recebe. */
export type PhoneMessage =
  | { type: 'hello'; player: string }
  | { type: 'state'; state: RemoteState };

export interface SpeechResponse {
  ok: true;
  delivered: boolean;
}

export interface ApiError {
  error: string;
}
