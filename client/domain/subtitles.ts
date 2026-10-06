import type { SubtitleCueDto } from '../../shared/contracts';

/** Fala que está na tela no instante `t` (segundos); legendas automáticas se sobrepõem, então vale a mais recente. */
export function activeCue(cues: SubtitleCueDto[], t: number): SubtitleCueDto | null {
  let found: SubtitleCueDto | null = null;
  for (const cue of cues) {
    if (cue.start > t) break;
    if (t < cue.end) found = cue;
  }
  return found;
}

/** 83 → "1:23". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
