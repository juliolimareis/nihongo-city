"""Extrai notas e áudios do deck Anki (ref-files/Japonese.apkg) para ajudar na curadoria.

Saída:
  server/seed/anki_raw.json   -> notas limpas (frente, verso, pt, kana, áudio, tags, tipo)
  audios/voices/anki_*.mp3    -> MP3s referenciados pelas notas
"""
import html
import json
import re
import sqlite3
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APKG = ROOT / "ref-files" / "Japonese.apkg"
OUT_JSON = ROOT / "server" / "seed" / "anki_raw.json"
VOICES = ROOT / "audios" / "voices"

OFF_TOPIC = re.compile(r"召喚|発動|ターン|特殊召喚|モンスター|カード")
SOUND_RE = re.compile(r"\[sound:([^\]]+)\]")
JP_RE = re.compile(r"[぀-ヿ一-鿿]")


def zstd_decompress(raw: bytes) -> bytes:
    try:
        import zstandard

        return zstandard.ZstdDecompressor().stream_reader(raw).read()
    except ImportError:
        return subprocess.run(["zstd", "-dc"], input=raw, capture_output=True, check=True).stdout


def read_varint(buf: bytes, i: int):
    shift = result = 0
    while True:
        b = buf[i]
        i += 1
        result |= (b & 0x7F) << shift
        if not b & 0x80:
            return result, i
        shift += 7


def parse_media_map(buf: bytes) -> dict:
    """Arquivo `media` (formato novo): protobuf MediaEntries{ repeated MediaEntry entries=1 }.
    O índice da entrada é o nome do membro no zip."""
    entries, i = [], 0
    while i < len(buf):
        key, i = read_varint(buf, i)
        if key & 7 != 2:
            raise ValueError("formato inesperado no arquivo media")
        ln, i = read_varint(buf, i)
        entry, i = buf[i : i + ln], i + ln
        name, j = None, 0
        while j < len(entry):
            k, j = read_varint(entry, j)
            field, wt = k >> 3, k & 7
            if wt == 0:
                _, j = read_varint(entry, j)
            elif wt == 2:
                n, j = read_varint(entry, j)
                if field == 1:
                    name = entry[j : j + n].decode("utf-8")
                j += n
            else:
                raise ValueError(f"wire type {wt} não suportado")
        entries.append(name)
    return {str(idx): name for idx, name in enumerate(entries)}


def strip_html(s: str) -> str:
    s = re.sub(r"<br\s*/?>|</div>|</p>|</tr>|</h\d>", "\n", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = html.unescape(s).replace(" ", " ")
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"\n\s*\n+", "\n", s)
    return s.strip()


def split_pt_kana(text: str):
    """Verso típico: 'Você gosta disso? - これ すき ですか'."""
    parts = re.split(r"\s+-\s*|\s*-\s+", text, maxsplit=1)
    if len(parts) == 2:
        a, b = parts
        if JP_RE.search(b) and not JP_RE.search(a):
            return a.strip(), b.strip()
        if JP_RE.search(a) and not JP_RE.search(b):
            return b.strip(), a.strip()
    if JP_RE.search(text):
        return None, text.strip()
    return text.strip(), None


def main():
    z = zipfile.ZipFile(APKG)
    data = bytearray(zstd_decompress(z.read("collection.anki21b")))
    data[18] = data[19] = 1  # cabeçalho WAL → rollback journal, para abrir em memória
    con = sqlite3.connect(":memory:")
    con.deserialize(bytes(data))

    media = parse_media_map(zstd_decompress(z.read("media")))
    name_to_idx = {v: k for k, v in media.items()}
    VOICES.mkdir(parents=True, exist_ok=True)

    notes, excluded, copied = [], [], 0
    for nid, flds, tags in con.execute("select id, flds, tags from notes order by id"):
        front_raw, back_raw = (flds.split("\x1f") + [""])[:2]
        sounds = SOUND_RE.findall(front_raw + back_raw)
        front = strip_html(SOUND_RE.sub("", front_raw))
        back = strip_html(SOUND_RE.sub("", back_raw))
        is_situation = front.lower().startswith(("situação", "você ", "diga", "pergunte", "diaga")) or not JP_RE.search(front)
        pt, kana = split_pt_kana(back)

        audio = None
        for s in sounds:
            idx = name_to_idx.get(s)
            if idx is None:
                continue
            dest = VOICES / f"anki_{s}"
            if not dest.exists():
                dest.write_bytes(zstd_decompress(z.read(idx)))
                copied += 1
            audio = dest.name
            break

        note = {
            "anki_id": nid,
            "type": "situation" if is_situation else "phrase",
            "front": front,
            "back": back,
            "pt": pt,
            "kana": kana,
            "audio_file": audio,
            "tags": tags.split(),
        }
        (excluded if OFF_TOPIC.search(front + back) else notes).append(note)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(
        json.dumps({"notes": notes, "excluded": excluded}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    situations = sum(n["type"] == "situation" for n in notes)
    print(f"{len(notes)} notas ({situations} situações), {len(excluded)} excluídas, {copied} áudios copiados")
    print(f"→ {OUT_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    sys.exit(main())
