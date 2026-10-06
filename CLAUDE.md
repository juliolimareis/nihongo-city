# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev         # tsx watch: restarts on server changes; esbuild rebuilds the client on save
npm start           # compiles the server (tsc → dist/) and runs it
npm run build       # build:server (tsc → dist/) + build:client (esbuild → public/build/)
npm run seed        # reseed SQLite from server/seed/*.json (run after editing seed files)
npm run typecheck   # tsc on server+shared and on client/ (esbuild does not type-check)
```

### Audio generation (Python)
```bash
cd scripts && source .venv/bin/activate
python generate_audio.py            # only missing files
python generate_audio.py --force    # regenerate all
python generate_audio.py --slow     # also generate slow versions (_slow.mp3)
# After running, always follow with: npm run seed
```

### Vídeos do "Estudar com TV" (Python)
```bash
cd scripts && source .venv/bin/activate   # precisa de ffmpeg/ffprobe no PATH e de `npm run seed` já rodado
python add_video.py <url-do-youtube>      # baixa, corta em partes de ~5 min e registra no SQLite
python add_video.py <url> --force         # refaz um vídeo já adicionado
python add_video.py --resub <id>           # baixa de novo só as legendas (não recorta o vídeo)
python add_video.py --reindex             # recria as linhas do banco a partir de media/tv/*/manifest.json
python add_video.py --remove <id>         # apaga arquivos e linhas do vídeo
```

## Architecture

**Nihongo City** is a browser-based Japanese-learning RPG set in Shibuya, targeting PT-BR speakers.
Everything is TypeScript, organized as DDD + hexagonal (ports & adapters) + SOLID.

### Stack

- **Server**: Node.js + Express 5 (CommonJS output), port 3000 HTTP / 3443 HTTPS. Dev runs via `tsx`; `npm start` runs the `tsc` output in `dist/`.
- **Frontend**: TypeScript (no framework), bundled by esbuild into `public/build/`
- **Database**: SQLite via `better-sqlite3` (`server/db/nihongo.db`, override with `NIHONGO_DB`)
- **Build target**: Chrome 79 — required for LG webOS 6 TV browsers (2021). Do not use browser APIs introduced after Chrome 79. `client/tsconfig.json` uses `lib: ES2019` to catch most of them.

### Layout

```
shared/contracts.ts      HTTP/SSE DTOs shared by server and client (types only)
server/src/
  domain/                pure rules, no Express/SQLite: entities, value objects, domain services, repository ports
    content/ player/ deck/ event/ remote/ tv/ language/ shared/
  application/           use cases (one class, one `execute`), output ports (Clock, UnitOfWork, ReadingService…), DTO mappers
  infrastructure/        adapters: persistence/sqlite, http (Express routes → use cases), reading (kuromoji),
                         remote (in-memory sessions, QR, LAN IPs), tls, build (esbuild), seed (JSON source), config
  container.ts           composition root: the only place that instantiates concrete classes
  main.ts                starts HTTP/HTTPS; cli/seed.ts and cli/build.ts are the npm script entrypoints
server/seed/*.json       content source of truth
client/
  domain/                pure logic: text matching, kana cycles, SRS dates
  application/           Store (state + events), ports (GameApi, AudioPort, SpeechRecognizer, RemoteMicrophone), SpeechMatcher, SettingsService
  infrastructure/        HTTP API, Web Audio, Web Speech, SSE remote mic, localStorage, polyfills
  ui/                    views (city, dialogue, study, deck, tv-study, settings, invites, pairing…), each receiving its dependencies in the constructor
  app/main.ts            TV composition root (+ start screen)
  phone/main.ts          phone (remote microphone) entrypoint
```

Dependency rule: `domain` imports nothing outside itself (except `shared/contracts` types); `application` imports `domain`; `infrastructure`/`ui` implement or consume the ports. New adapters are wired in `server/src/container.ts` or `client/app/main.ts`.

Repository ports are synchronous because `better-sqlite3` is synchronous; multi-step writes go through `UnitOfWork.run()` (a SQLite transaction). SQLite adapters extend `SqliteStore` so they can prepare statements in field initializers. Domain errors (`NotFoundError` → 404, `ValidationError` → 400) are mapped to HTTP in `infrastructure/http/error-handler.ts`.

### Data flow

Game content lives in `server/seed/*.json` (expressions, NPCs, scenes, locations, scenarios). These are the **source of truth**. After editing them, run `npm run seed` (validated by `domain/content/catalog.ts`, written by `SqliteContentWriter`). The server reads only from the DB at runtime.

Audio files are named by `sha1(tts_text(jp))[:12].mp3` and stored in `audios/voices/`. The `audio_file` field in `expressions.json` is updated by `generate_audio.py`. Commit both the JSON and the generated MP3s. NPC images are `img/npcs/<npc_id>.png`, served at `/npcs/`.

### HTTP API (`server/src/infrastructure/http/controllers/`)

| Route | Controller → use case |
|---|---|
| `GET /api/scenes`, `GET /api/music` | `game-routes.ts` → `ListScenes`, `ListMusic` |
| `POST /api/events` | `StartEvent` (scenario picked by `domain/event/scenario-picker.ts`) |
| `POST /api/events/:id/attempts` | `RecordAttempt` |
| `POST /api/events/:id/finish` | `FinishEvent` (cards via `domain/event/learning.ts`, XP via `XpPolicy`) |
| `GET /api/invites/next` | `GetNextInvite` |
| `POST /api/reading` | `ConvertReading` (kanji → hiragana via kuromoji) |
| `/api/players` | `player-routes.ts` → `LoginPlayer`, `GetProfile`, `UpdateSettings`, `ResetProgress` |
| `/api/cards` | `card-routes.ts` → `ListCards`, `ListDueCards` (daily limit via `StudyDay` + `domain/deck/daily-limit.ts`), `ReviewCard` (SM-2 in `domain/deck/scheduling.ts`) |
| `/api/tv` | `tv-routes.ts` → `ListTvVideos`, `GetTvVideo`, `GetTvTranscript`, `SaveTvProgress` |
| `/api/remote/*` | `remote-routes.ts` → SSE sessions for phone mic, QR code |

### Estudar com TV (rádio + vídeo)

`scripts/add_video.py` is the only writer of `tv_videos`/`tv_parts`: it downloads a YouTube video with yt-dlp, cuts it with ffmpeg into ~5 min parts (`part_NN.mp4` H.264/AAC + `part_NN.mp3`) under `media/tv/<youtube_id>/` (git-ignored, served at `/media`), and stores each part's JP and PT-BR subtitle cues as JSON, with times relative to the part. The JP track must be the transcription of the audio itself (manual `ja`, else `ja-orig` / an automatic track without `tlang`): yt-dlp's plain automatic `ja` can be a machine translation of another audio track. PT-BR is the manual track or the automatic translation of that JP track. The schema still lives only in `schema.ts`, so the script requires the tables to exist. Each video folder keeps a `manifest.json` so `--reindex` can rebuild the DB rows. The client (`client/ui/tv-study-view.ts`) draws subtitles itself from those cues instead of using `<track>`; per-player progress is in `player_tv_progress`, the subtitle preference in localStorage.

### Remote phone feature

The phone opens `remote.html` (built from `client/phone/main.ts`) over HTTPS. The server generates a self-signed cert on first run (stored in `server/certs/`, regenerated when LAN IPs change). TV and phone exchange state via SSE; the `RemoteSession` aggregate (`domain/remote`) routes messages and the HTTP layer adapts SSE streams to `RemoteClient`. The HTTPS server is required because the Web Speech API needs a secure context on the phone.

### Reading (kanji → kana)

`KuromojiReadingService` tokenizes Japanese text and converts it to hiragana (number → kanji normalization lives in `domain/language/japanese.ts`). If kuromoji fails to load, the server falls back to katakana→hiragana conversion only (the warning is non-fatal).
