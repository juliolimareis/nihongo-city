/** DDL idempotente aplicado ao abrir o banco. */
export const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

-- ===== Conteúdo do jogo (populado pelo seed) =====

CREATE TABLE IF NOT EXISTS expressions (
  id               TEXT PRIMARY KEY,
  japanese         TEXT NOT NULL,
  kana             TEXT NOT NULL,
  romaji           TEXT NOT NULL,
  portuguese       TEXT NOT NULL,
  usage_pt         TEXT NOT NULL DEFAULT '',
  culture_note_pt  TEXT NOT NULL DEFAULT '',
  politeness       TEXT NOT NULL DEFAULT 'polido',   -- casual | polido | keigo
  category         TEXT NOT NULL DEFAULT 'conversa',
  source           TEXT NOT NULL DEFAULT 'custom',   -- pdf | anki | custom
  variants         TEXT NOT NULL DEFAULT '[]',       -- JSON: grafias/leituras aceitas na voz
  audio_file       TEXT
);

CREATE TABLE IF NOT EXISTS npcs (
  id          TEXT PRIMARY KEY,
  name_jp     TEXT NOT NULL,
  name_pt     TEXT NOT NULL,
  role_pt     TEXT NOT NULL DEFAULT '',
  image_file  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scenes (
  id          TEXT PRIMARY KEY,
  name_jp     TEXT NOT NULL,
  name_pt     TEXT NOT NULL,
  image_file  TEXT NOT NULL,
  img_w       INTEGER NOT NULL,
  img_h       INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS locations (
  id        TEXT PRIMARY KEY,
  scene_id  TEXT NOT NULL REFERENCES scenes(id),
  name_jp   TEXT NOT NULL,
  name_pt   TEXT NOT NULL,
  icon      TEXT NOT NULL DEFAULT '📍',
  kind      TEXT NOT NULL DEFAULT 'place',   -- place | street | signpost
  x_pct     REAL NOT NULL,
  y_pct     REAL NOT NULL,
  w_pct     REAL NOT NULL,
  h_pct     REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS scenarios (
  id                     TEXT PRIMARY KEY,
  kind                   TEXT NOT NULL,             -- location | invite
  location_id            TEXT REFERENCES locations(id),
  npc_id                 TEXT NOT NULL REFERENCES npcs(id),
  title_pt               TEXT NOT NULL,
  invite_text_pt         TEXT,
  invite_text_jp         TEXT,
  culture_note_pt        TEXT NOT NULL DEFAULT '',
  farewell_expression_id TEXT NOT NULL REFERENCES expressions(id),
  min_level              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS scenario_steps (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  scenario_id        TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  step_key           TEXT NOT NULL,
  step_order         INTEGER NOT NULL,
  npc_expression_id  TEXT NOT NULL REFERENCES expressions(id),
  prompt_pt          TEXT NOT NULL,
  UNIQUE (scenario_id, step_key)
);

CREATE TABLE IF NOT EXISTS step_options (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  step_id        INTEGER NOT NULL REFERENCES scenario_steps(id) ON DELETE CASCADE,
  option_order   INTEGER NOT NULL,
  expression_id  TEXT NOT NULL REFERENCES expressions(id),
  is_correct     INTEGER NOT NULL DEFAULT 0,
  feedback_pt    TEXT NOT NULL DEFAULT '',
  next_step_key  TEXT                                -- NULL = encerra o evento
);

-- ===== Jogador =====

CREATE TABLE IF NOT EXISTS players (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  level       INTEGER NOT NULL DEFAULT 1,
  xp          INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS player_settings (
  player_id         INTEGER PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  music_on          INTEGER NOT NULL DEFAULT 1,
  music_volume      REAL    NOT NULL DEFAULT 0.10,
  sfx_on            INTEGER NOT NULL DEFAULT 1,
  sfx_volume        REAL    NOT NULL DEFAULT 0.5,
  voice_volume      REAL    NOT NULL DEFAULT 1.0,
  show_romaji       INTEGER NOT NULL DEFAULT 1,
  show_translation  INTEGER NOT NULL DEFAULT 1,
  text_speed        INTEGER NOT NULL DEFAULT 40,     -- ms por caractere
  current_scene     TEXT    NOT NULL DEFAULT 'shibuya_main',
  invites_on        INTEGER NOT NULL DEFAULT 1,
  invite_frequency  TEXT    NOT NULL DEFAULT 'normal', -- pouco | normal | muito
  daily_new_cards   INTEGER NOT NULL DEFAULT 10,     -- cartas novas por dia
  daily_reviews     INTEGER NOT NULL DEFAULT 50      -- revisões por dia
);

CREATE TABLE IF NOT EXISTS player_cards (
  player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expression_id  TEXT    NOT NULL REFERENCES expressions(id),
  added_at       TEXT    NOT NULL DEFAULT (datetime('now')),
  ease           REAL    NOT NULL DEFAULT 2.5,
  interval_days  REAL    NOT NULL DEFAULT 0,
  repetitions    INTEGER NOT NULL DEFAULT 0,
  lapses         INTEGER NOT NULL DEFAULT 0,
  due_at         TEXT    NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (player_id, expression_id)
);

CREATE TABLE IF NOT EXISTS event_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id    INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  scenario_id  TEXT    NOT NULL REFERENCES scenarios(id),
  source       TEXT    NOT NULL DEFAULT 'click',   -- click | invite
  started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  finished_at  TEXT,
  outcome      TEXT,                                -- success | failed | abandoned
  mistakes     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS attempt_log (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id           INTEGER NOT NULL REFERENCES event_log(id) ON DELETE CASCADE,
  step_id            INTEGER NOT NULL REFERENCES scenario_steps(id),
  transcript         TEXT,
  matched_option_id  INTEGER REFERENCES step_options(id),
  similarity         REAL,
  correct            INTEGER NOT NULL DEFAULT 0,
  created_at         TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS review_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id      INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  expression_id  TEXT    NOT NULL REFERENCES expressions(id),
  mode           TEXT    NOT NULL,                  -- audio | read | write
  rating         TEXT    NOT NULL,                  -- again | hard | good | easy
  reviewed_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- O nome é a chave de "login": um nome, um progresso (maiúsculas não contam).
CREATE UNIQUE INDEX IF NOT EXISTS idx_players_name ON players(name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_cards_due     ON player_cards(player_id, due_at);
CREATE INDEX IF NOT EXISTS idx_reviews_card  ON review_log(player_id, expression_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_events_player ON event_log(player_id, started_at);
CREATE INDEX IF NOT EXISTS idx_steps_scen    ON scenario_steps(scenario_id, step_order);
CREATE INDEX IF NOT EXISTS idx_options_step  ON step_options(step_id, option_order);
`;
