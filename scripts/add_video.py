"""Adiciona um vídeo do YouTube ao recurso "Estudar com TV".

Baixa o vídeo e as legendas (japonês e PT-BR), corta em partes de ~5 min (vídeo MP4 + áudio MP3),
grava tudo em media/tv/<id>/ e registra as partes no SQLite. O jogo lê só do banco.

Requisitos: ffmpeg e ffprobe no PATH (sudo apt install ffmpeg) e `pip install -r requirements.txt`.
As tabelas são criadas pelo servidor: rode `npm run seed` (ou abra o jogo) uma vez antes.

Uso:
  python scripts/add_video.py <url>                     # baixa, corta e registra
  python scripts/add_video.py <url> --start 1:30        # começa em 1 min 30 s (pula a intro)
  python scripts/add_video.py <url> --start 90          # mesmo que acima, em segundos
  python scripts/add_video.py <url> --keep-source       # não apaga o vídeo original baixado
  python scripts/add_video.py --resub <id>              # baixa de novo só as legendas (não recorta o vídeo)
  python scripts/add_video.py --reindex                 # recria as linhas do banco a partir de media/tv/*/manifest.json
  python scripts/add_video.py --remove <id>             # apaga o vídeo (arquivos e banco)

Reenviar a mesma URL apaga o vídeo existente e refaz o processo (equivale a --remove + adicionar).
"""
import argparse
import json
import os
import re
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
MEDIA = ROOT / "media" / "tv"

PART_S = 300.0       # tamanho alvo de cada parte
MIN_LAST_S = 120.0   # sobra menor que isso é dividida com a penúltima parte
MAX_PART_S = 480.0   # teto rígido depois do ajuste ao silêncio
SNAP_S = 15.0        # quanto um corte pode andar para cair entre duas falas
MIN_GAP_S = 0.4      # pausa entre falas que já serve como ponto de corte
MAX_HEIGHT = 720
ID_RE = re.compile(r"^[\w-]+$")
NOISE_RE = re.compile(r"\[[^\]]*\]|［[^］]*］")  # [音楽], [拍手], [Música]…
JA_S_PER_CHAR = 0.15  # tempo mínimo na tela por caractere de cada fala
PT_S_PER_CHAR = 0.06
RETRY_WAITS_S = (10, 30)  # o YouTube responde 429 com facilidade nas legendas traduzidas


# ===== Cortes =====

def ideal_cuts(duration: float) -> list[float]:
    """Instantes de corte: partes de 5 min; se a sobra for curta, as duas últimas dividem o tempo."""
    full = int(duration // PART_S)
    rest = duration - full * PART_S
    if full == 0:
        return []
    if rest < 1:  # múltiplo exato de 5 min
        return [PART_S * i for i in range(1, full)]
    if rest >= MIN_LAST_S:
        return [PART_S * i for i in range(1, full + 1)]
    cuts = [PART_S * i for i in range(1, full)]
    return cuts + [(full - 1) * PART_S + (PART_S + rest) / 2]


def snap_cut(cut: float, cues: list[dict]) -> float:
    """Leva o corte para a pausa entre falas mais próxima, para não partir uma frase no meio."""
    pauses, edges = [], []
    for prev, nxt in zip(cues, cues[1:]):
        middle = (prev["end"] + nxt["start"]) / 2
        if abs(middle - cut) > SNAP_S:
            continue
        edges.append(middle)
        if nxt["start"] - prev["end"] >= MIN_GAP_S:
            pauses.append(middle)
    candidates = pauses or edges
    return min(candidates, key=lambda c: abs(c - cut)) if candidates else cut


def plan_parts(duration: float, cues: list[dict] | None = None) -> list[tuple[float, float]]:
    """Lista de (início, fim) em segundos cobrindo o vídeo inteiro."""
    cuts = ideal_cuts(duration)
    if cues:
        snapped = [snap_cut(c, cues) for c in cuts]
        bounds = [0.0, *snapped, duration]
        sizes = [b - a for a, b in zip(bounds, bounds[1:])]
        if all(0 < s <= MAX_PART_S for s in sizes):
            cuts = snapped
    bounds = [0.0, *cuts, duration]
    return list(zip(bounds, bounds[1:]))


# ===== Legendas =====

def parse_json3(raw: bytes | str, s_per_char: float = 0.0) -> list[dict]:
    """Legenda do YouTube (formato json3) → [{start, end, text}] em segundos, sem repetições.

    `s_per_char` é o tempo mínimo de leitura por caractere: a transcrição automática às vezes dá
    3 s fixos a uma fala longa, e a legenda sumiria antes de a pessoa terminar de falar.
    """
    cues = []
    for event in json.loads(raw).get("events", []):
        text = "".join(seg.get("utf8", "") for seg in event.get("segs") or [])
        text = re.sub(r"\s+", " ", NOISE_RE.sub("", text)).strip()
        if not text:
            continue
        start = event.get("tStartMs", 0) / 1000
        length = max(event.get("dDurationMs", 0) / 1000, len(text) * s_per_char)
        cues.append({"start": start, "end": start + length, "text": text})
    cues.sort(key=lambda c: c["start"])

    clean = []
    for cue in cues:
        if clean and clean[-1]["text"] == cue["text"] and cue["start"] <= clean[-1]["end"]:
            clean[-1]["end"] = max(clean[-1]["end"], cue["end"])
            continue
        if clean and clean[-1]["end"] > cue["start"]:
            # Legenda automática "rola" duas linhas: a anterior termina quando a próxima começa.
            clean[-1]["end"] = cue["start"]
        clean.append(cue)
    return [c for c in clean if c["end"] > c["start"]]


def shift_cues(cues: list[dict], offset: float) -> list[dict]:
    """Tempos relativos ao ponto de início escolhido (--start); descarta o que ficou antes dele."""
    return [
        dict(c, start=max(0.0, round(c["start"] - offset, 2)), end=round(c["end"] - offset, 2))
        for c in cues
        if c["end"] > offset
    ]


def cues_for_part(cues: list[dict], start: float, end: float) -> list[dict]:
    """Falas que começam dentro da parte, com os tempos relativos ao início dela."""
    return [
        {"start": round(c["start"] - start, 2), "end": round(min(c["end"], end) - start, 2), "text": c["text"]}
        for c in cues
        if start <= c["start"] < end
    ]


def json3_url(formats: list[dict]) -> str | None:
    return next((f["url"] for f in formats if f.get("ext") == "json3" and f.get("url")), None)


def is_translation(url: str) -> bool:
    return "tlang" in parse_qs(urlsplit(url).query)


def with_tlang(url: str, lang: str) -> str:
    parts = urlsplit(url)
    query = {**parse_qs(parts.query), "tlang": [lang]}
    return urlunsplit(parts._replace(query=urlencode(query, doseq=True)))


def matching(tracks: dict, prefixes: list[str]) -> list[str]:
    """Códigos de idioma que casam com os prefixos, na ordem de preferência ("pt-BR" antes de "pt")."""
    return [
        lang
        for prefix in prefixes
        for lang in sorted(tracks, key=len)
        if lang == prefix or lang.startswith(prefix + "-")
    ]


def pick_original(info: dict, prefix: str) -> tuple[str, str] | None:
    """Legenda no idioma falado: a escrita à mão ou a transcrição automática do próprio áudio.

    O yt-dlp lista em `automatic_captions` todas as traduções automáticas; "ja" pode ser a
    transcrição de outra faixa de áudio (inglês) traduzida para japonês, que não bate com o que
    se ouve. A transcrição de verdade é "ja-orig" ou a faixa cuja URL não tem `tlang`.
    """
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    for lang in matching(manual, [prefix]):
        url = json3_url(manual[lang])
        if url:
            return url, f"{lang} (manual)"
    langs = matching(auto, [prefix])
    for lang in sorted(langs, key=lambda code: not code.endswith("-orig")):
        url = json3_url(auto[lang])
        if url and not is_translation(url):
            return url, f"{lang} (transcrição automática)"
    for lang in langs:
        url = json3_url(auto[lang])
        if url:
            print(f"  ! o vídeo não tem transcrição em {prefix}: usando tradução automática, que não bate com o áudio")
            return url, f"{lang} (tradução automática)"
    return None


def pick_translation(info: dict, prefixes: list[str], original_url: str | None) -> tuple[str, str] | None:
    """Legenda traduzida: a escrita à mão ou a tradução automática da legenda original."""
    manual = info.get("subtitles") or {}
    auto = info.get("automatic_captions") or {}
    for lang in matching(manual, prefixes):
        url = json3_url(manual[lang])
        if url:
            return url, f"{lang} (manual)"
    langs = matching(auto, prefixes)
    if not langs:
        return None
    if original_url and not is_translation(original_url):
        # Traduzir a própria legenda original mantém as falas alinhadas com ela.
        return with_tlang(original_url, langs[0]), f"{langs[0]} (tradução automática da original)"
    url = json3_url(auto[langs[0]])
    return (url, f"{langs[0]} (tradução automática)") if url else None


def fetch_subtitles(ydl, track: tuple[str, str] | None, name: str, s_per_char: float) -> list[dict] | None:
    """Falas da legenda; [] se o vídeo não tem essa legenda e None se o download falhou."""
    if not track:
        print(f"  ! sem legenda em {name}")
        return []
    url, label = track
    for wait in (*RETRY_WAITS_S, None):
        try:
            cues = parse_json3(ydl.urlopen(url).read(), s_per_char)
            print(f"  legenda {name}: {label}, {len(cues)} falas")
            return cues
        except Exception as exc:  # rede/429: o vídeo continua valendo sem essa legenda
            if wait is None:
                print(f"  ! não consegui baixar a legenda {label}: {exc}")
                return None
            print(f"  legenda {name}: {exc} -- tentando de novo em {wait} s")
            time.sleep(wait)


def fetch_both(ydl, info: dict) -> tuple[list[dict] | None, list[dict] | None]:
    original = pick_original(info, "ja")
    ja = fetch_subtitles(ydl, original, "japonês", JA_S_PER_CHAR)
    translation = pick_translation(info, ["pt-BR", "pt"], original[0] if original else None)
    pt = fetch_subtitles(ydl, translation, "PT-BR", PT_S_PER_CHAR)
    return ja, pt


# ===== ffmpeg =====

def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def ffmpeg(*args: str):
    try:
        run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", *args])
    except subprocess.CalledProcessError as exc:
        sys.exit(f"ffmpeg falhou:\n{exc.stderr.strip()}")


def probe_duration(path: Path) -> float:
    out = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)])
    return float(out.strip())


def cut_part(source: Path, dest: Path, start: float, length: float):
    """Recodifica para o corte ser exato e para a TV (Chrome 79) tocar com certeza: H.264 + AAC e MP3."""
    window = ["-ss", f"{start:.3f}", "-i", str(source), "-t", f"{length:.3f}"]
    ffmpeg(
        *window, "-map", "0:v:0", "-map", "0:a:0",
        "-vf", f"scale=-2:'min({MAX_HEIGHT},ih)'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-movflags", "+faststart", str(dest.with_suffix(".mp4")),
    )
    ffmpeg(*window, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", "-ac", "2", str(dest.with_suffix(".mp3")))


# ===== Banco =====

def db_path() -> Path:
    """Mesmo banco do servidor: NIHONGO_DB do ambiente, depois do .env, depois o padrão."""
    value = os.environ.get("NIHONGO_DB")
    env_file = ROOT / ".env"
    if not value and env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, _, val = line.partition("=")
            if key.strip() == "NIHONGO_DB":
                value = val.strip().strip("\"'")
    return Path(value) if value else ROOT / "server" / "db" / "nihongo.db"


def open_db() -> sqlite3.Connection:
    path = db_path()
    if not path.exists():
        sys.exit(f"Banco não encontrado em {path}. Rode antes: npm run seed")
    con = sqlite3.connect(path)
    con.execute("PRAGMA foreign_keys = ON")
    if not con.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'tv_parts'").fetchone():
        sys.exit("O banco ainda não tem as tabelas de vídeo. Rode antes: npm run seed")
    # Confere antes de baixar: sem esta coluna o processo só falharia no fim, depois de cortar tudo.
    if not any(row[1] == "url" for row in con.execute("PRAGMA table_info(tv_videos)")):
        sys.exit("O banco está com o formato antigo das tabelas de vídeo. Rode antes: npm run seed")
    return con


def index_video(con: sqlite3.Connection, manifest: dict):
    """Grava o vídeo e substitui as partes; o progresso dos jogadores no vídeo é mantido."""
    with con:
        con.execute(
            """INSERT INTO tv_videos (id, url, title, channel, duration_s, thumbnail_file)
               VALUES (:id, :url, :title, :channel, :duration_s, :thumbnail_file)
               ON CONFLICT (id) DO UPDATE SET url = excluded.url, title = excluded.title,
                 channel = excluded.channel, duration_s = excluded.duration_s,
                 thumbnail_file = excluded.thumbnail_file""",
            manifest,
        )
        con.execute("DELETE FROM tv_parts WHERE video_id = ?", (manifest["id"],))
        for part in manifest["parts"]:
            con.execute(
                """INSERT INTO tv_parts (video_id, part_index, start_s, duration_s, video_file, audio_file, subs_ja, subs_pt)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    manifest["id"], part["index"], part["start_s"], part["duration_s"],
                    part["video_file"], part["audio_file"],
                    json.dumps(part["subs_ja"], ensure_ascii=False), json.dumps(part["subs_pt"], ensure_ascii=False),
                ),
            )


def read_manifest(folder: Path) -> dict | None:
    path = folder / "manifest.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


# ===== Comandos =====

def parse_start(value: str) -> float:
    """Converte '1:30', '1:30.5' ou '90' em segundos. Aceita tambem '0' e '' (sem pulo)."""
    value = value.strip()
    if not value:
        return 0.0
    if ":" in value:
        parts = value.split(":")
        try:
            if len(parts) == 2:
                return int(parts[0]) * 60 + float(parts[1])
            if len(parts) == 3:
                return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
        except ValueError:
            pass
        raise argparse.ArgumentTypeError(f"formato inválido para --start: {value!r} (use 90, 1:30 ou 1:30:00)")
    try:
        return float(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"formato inválido para --start: {value!r} (use 90, 1:30 ou 1:30:00)")


def find_video_by_url(con: sqlite3.Connection, url: str) -> str | None:
    """Devolve o id do vídeo que foi gravado com esta URL, ou None."""
    row = con.execute("SELECT id FROM tv_videos WHERE url = ?", (url,)).fetchone()
    return row[0] if row else None


def add(url: str, start_s: float, keep_source: bool):
    for tool in ("ffmpeg", "ffprobe"):
        if not shutil.which(tool):
            sys.exit(f"{tool} não encontrado. Instale com: sudo apt install ffmpeg")
    try:
        from yt_dlp import YoutubeDL
    except ImportError:
        sys.exit("yt-dlp não instalado. Rode: pip install -r scripts/requirements.txt")
    con = open_db()

    MEDIA.mkdir(parents=True, exist_ok=True)
    options = {
        "format": (
            f"bv*[height<={MAX_HEIGHT}][vcodec^=avc1]+ba[ext=m4a]/"
            f"bv*[height<={MAX_HEIGHT}]+ba/b[height<={MAX_HEIGHT}]/b"
        ),
        "merge_output_format": "mp4",
        "outtmpl": str(MEDIA / "%(id)s" / "source.%(ext)s"),
        "noplaylist": True,
    }
    with YoutubeDL(options) as ydl:
        info = ydl.extract_info(url, download=False)
        video_id = info["id"]
        if not ID_RE.match(video_id):
            sys.exit(f"Id de vídeo inesperado: {video_id!r}")
        folder = MEDIA / video_id

        # Se a mesma URL já foi adicionada (mesmo que com outro id), apaga e refaz.
        existing_id = find_video_by_url(con, info.get("webpage_url") or url)
        if existing_id:
            print(f"URL já conhecida (id={existing_id}). Apagando e refazendo…")
            remove_by_id(con, existing_id)

        title = info.get('title') or video_id
        if start_s > 0:
            fmt_start = f"{int(start_s // 60)}:{int(start_s % 60):02d}"
            print(f'Baixando "{title}" (pulando os primeiros {fmt_start})...')
        else:
            print(f'Baixando "{title}"...')
        ydl.process_ie_result(info, download=True)
        ja, pt = fetch_both(ydl, info)

    sources = sorted(folder.glob("source.*"))
    if not sources:
        sys.exit("O download terminou sem arquivo de vídeo.")
    source = sources[0]
    full_duration = probe_duration(source)

    if start_s >= full_duration:
        sys.exit(f"--start {start_s:.1f}s é maior ou igual à duração do vídeo ({full_duration:.1f}s).")
    if start_s > 0:
        print(f"  duração total: {full_duration / 60:.2f} min → usando a partir de {start_s / 60:.2f} min")

    duration = full_duration - start_s
    ja = shift_cues(ja or [], start_s)
    pt = shift_cues(pt or [], start_s)

    parts = plan_parts(duration, ja)

    for old in [*folder.glob("part_*.mp4"), *folder.glob("part_*.mp3")]:
        old.unlink()

    # Thumbnail: 10% da duração usável (ou até 30 s depois do ponto de início).
    thumb_offset = start_s + min(duration * 0.1, 30)
    ffmpeg(
        "-ss", f"{thumb_offset:.2f}", "-i", str(source),
        "-frames:v", "1", "-vf", "scale=480:-2", "-q:v", "4", str(folder / "thumb.jpg"),
    )

    canonical_url = info.get("webpage_url") or url
    manifest = {
        "id": video_id,
        "url": canonical_url,
        "title": info.get("title") or video_id,
        "channel": info.get("channel") or info.get("uploader") or "",
        "duration_s": round(duration, 2),
        "start_offset_s": round(start_s, 2),
        "thumbnail_file": "thumb.jpg",
        "parts": [],
    }
    for index, (seg_start, seg_end) in enumerate(parts, 1):
        name = f"part_{index:02d}"
        # Os cortes são relativos ao ponto de início; convertemos para offset no arquivo fonte.
        abs_start = start_s + seg_start
        abs_length = seg_end - seg_start
        print(f"[{index}/{len(parts)}] {name}: {seg_start / 60:5.2f} → {seg_end / 60:5.2f} min ({abs_length / 60:.2f} min)")
        cut_part(source, folder / name, abs_start, abs_length)
        manifest["parts"].append({
            "index": index,
            "start_s": round(seg_start, 2),
            "duration_s": round(abs_length, 2),
            "video_file": f"{name}.mp4",
            "audio_file": f"{name}.mp3",
            "subs_ja": cues_for_part(ja, seg_start, seg_end),
            "subs_pt": cues_for_part(pt, seg_start, seg_end),
        })

    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    index_video(con, manifest)
    if not keep_source:
        source.unlink()
    print(f'\n{len(parts)} partes em {folder.relative_to(ROOT)}/ -- ja aparecem em "Estudar com TV".')


def resub(video_id: str):
    """Baixa as legendas de novo e as redistribui pelas partes já cortadas, sem mexer no vídeo."""
    if not ID_RE.match(video_id):
        sys.exit(f"Id inválido: {video_id!r}")
    try:
        from yt_dlp import YoutubeDL
    except ImportError:
        sys.exit("yt-dlp não instalado. Rode: pip install -r scripts/requirements.txt")
    con = open_db()
    folder = MEDIA / video_id
    manifest = read_manifest(folder)
    if not manifest:
        sys.exit(f"Vídeo {video_id} não encontrado em {MEDIA.relative_to(ROOT)}/.")
    url = manifest.get("url") or f"https://www.youtube.com/watch?v={video_id}"
    offset = manifest.get("start_offset_s", 0.0)

    print(f'Refazendo as legendas de "{manifest["title"]}"...')
    with YoutubeDL({"noplaylist": True, "quiet": True}) as ydl:
        ja, pt = fetch_both(ydl, ydl.extract_info(url, download=False))
    for key, cues in (("subs_ja", ja), ("subs_pt", pt)):
        if cues is None:
            print(f"  ! {key} ficou como estava")
            continue
        cues = shift_cues(cues, offset)
        for part in manifest["parts"]:
            part[key] = cues_for_part(cues, part["start_s"], part["start_s"] + part["duration_s"])

    manifest.setdefault("url", url)
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    index_video(con, manifest)
    print("Legendas atualizadas.")


def reindex():
    con = open_db()
    count = 0
    for folder in sorted(MEDIA.glob("*")):
        manifest = read_manifest(folder)
        if manifest:
            # Compatibilidade com manifests antigos que não tinham 'url'.
            manifest.setdefault("url", "")
            index_video(con, manifest)
            count += 1
            print(f"{manifest['id']}  {len(manifest['parts'])} partes  {manifest['title']}")
    print(f"\n{count} vídeo(s) registrados no banco.")


def remove_by_id(con: sqlite3.Connection, video_id: str):
    """Apaga o vídeo do banco e os arquivos em media/tv/<id>/. Não fecha a conexão."""
    with con:
        con.execute("DELETE FROM tv_videos WHERE id = ?", (video_id,))
    folder = MEDIA / video_id
    if folder.is_dir():
        shutil.rmtree(folder)


def remove(video_id: str):
    if not ID_RE.match(video_id):
        sys.exit(f"Id inválido: {video_id!r}")
    con = open_db()
    exists_db = con.execute("SELECT 1 FROM tv_videos WHERE id = ?", (video_id,)).fetchone()
    exists_fs = (MEDIA / video_id).is_dir()
    if not exists_db and not exists_fs:
        sys.exit(f"Vídeo {video_id} não encontrado.")
    remove_by_id(con, video_id)
    print(f"Vídeo {video_id} removido.")


def main():
    ap = argparse.ArgumentParser(description='Adiciona um video do YouTube ao "Estudar com TV".')
    ap.add_argument("url", nargs="?", help="endereço do vídeo no YouTube")
    ap.add_argument(
        "--start", metavar="TEMPO", type=parse_start, default=0.0,
        help="onde o vídeo deve começar, pulando a intro (ex.: 1:30 ou 90). "
             "Aceita segundos, mm:ss ou hh:mm:ss.",
    )
    ap.add_argument("--keep-source", action="store_true", help="mantém o vídeo original baixado")
    ap.add_argument("--force", action="store_true", help="reprocessa a URL mesmo se já foi adicionada (equivale ao comportamento padrão, mantido para compatibilidade)")
    ap.add_argument("--reindex", action="store_true", help="recria o banco a partir dos manifest.json")
    ap.add_argument("--resub", metavar="ID", help="baixa de novo só as legendas de um vídeo já adicionado")
    ap.add_argument("--remove", metavar="ID", help="apaga um vídeo (arquivos e banco)")
    args = ap.parse_args()

    if args.reindex:
        reindex()
    elif args.resub:
        resub(args.resub)
    elif args.remove:
        remove(args.remove)
    elif args.url:
        add(args.url, args.start, args.keep_source)
    else:
        ap.error("informe a URL do vídeo, --reindex, --resub ID ou --remove ID")


if __name__ == "__main__":
    sys.exit(main())
