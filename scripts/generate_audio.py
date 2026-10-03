"""Gera os MP3 das falas em japonês com gTTS (TTS do Google Translate, sem chave de API).

Lê server/seed/expressions.json, gera audios/voices/<sha1>.mp3 para cada expressão sem áudio
e grava o campo audio_file de volta no JSON. Depois rode `npm run seed`.

Uso:
  python scripts/generate_audio.py           # só o que falta
  python scripts/generate_audio.py --force   # regenera tudo
  python scripts/generate_audio.py --slow    # também gera versões lentas (<hash>_slow.mp3)
"""
import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path

from gtts import gTTS

ROOT = Path(__file__).resolve().parent.parent
EXPRESSIONS = ROOT / "server" / "seed" / "expressions.json"
VOICES = ROOT / "audios" / "voices"
PAUSE_S = 0.5
RETRIES = 4


def tts_text(jp: str) -> str:
    # "…" e "ー" finais fazem o gTTS alongar/ler estranho; reticências viram pausa curta.
    return re.sub(r"[…]+", "、", jp).strip("、 ")


def synth(text: str, dest: Path, slow: bool):
    for attempt in range(1, RETRIES + 1):
        try:
            gTTS(text=text, lang="ja", slow=slow).save(str(dest))
            return
        except Exception as exc:  # gTTS levanta erros genéricos de rede/429
            if attempt == RETRIES:
                raise
            wait = 2 ** attempt
            print(f"  ! {exc.__class__.__name__}: nova tentativa em {wait}s")
            time.sleep(wait)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="regenera todos os áudios")
    ap.add_argument("--slow", action="store_true", help="gera também versões lentas")
    args = ap.parse_args()

    VOICES.mkdir(parents=True, exist_ok=True)
    expressions = json.loads(EXPRESSIONS.read_text(encoding="utf-8"))
    made = skipped = 0

    try:
        for i, expr in enumerate(expressions, 1):
            text = tts_text(expr["jp"])
            name = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
            targets = [(VOICES / f"{name}.mp3", False)]
            if args.slow:
                targets.append((VOICES / f"{name}_slow.mp3", True))

            for path, slow in targets:
                if path.exists() and not args.force:
                    skipped += 1
                    continue
                synth(text, path, slow)
                made += 1
                print(f"[{i}/{len(expressions)}] {path.name}  {expr['jp']}")
                time.sleep(PAUSE_S)

            expr["audio_file"] = f"{name}.mp3"
    finally:
        # Salva o progresso mesmo se for interrompido no meio.
        EXPRESSIONS.write_text(
            "[\n" + ",\n".join(json.dumps(e, ensure_ascii=False) for e in expressions) + "\n]\n",
            encoding="utf-8",
        )

    print(f"\n{made} gerados, {skipped} já existiam → {VOICES.relative_to(ROOT)}/")
    print("Agora rode: npm run seed")


if __name__ == "__main__":
    sys.exit(main())
