import type { SettingsDto } from '../../shared/contracts';
import type { AudioPort, SfxName } from '../application/ports';

// Três canais independentes: música (bem baixa), voz (100%) e efeitos sintetizados.
const DUCK_LEVEL = 0.03;
const DUCK_MS = 300;
const CROSSFADE_MS = 2000;

type AudioSettings = Pick<SettingsDto, 'music_on' | 'music_volume' | 'sfx_on' | 'sfx_volume' | 'voice_volume'>;
const DEFAULTS: AudioSettings = { music_on: true, music_volume: 0.1, sfx_on: true, sfx_volume: 0.5, voice_volume: 1 };

type Note = [freq: number, at: number, dur: number, type?: OscillatorType];
const NOTES: Record<SfxName, Note[]> = {
  correct: [[660, 0, 0.12], [880, 0.1, 0.12], [1320, 0.2, 0.22]],
  wrong: [[220, 0, 0.18, 'square'], [165, 0.15, 0.28, 'square']],
  card: [[1046, 0, 0.08], [1318, 0.06, 0.08], [1568, 0.12, 0.08], [2093, 0.18, 0.2]],
  notify: [[784, 0, 0.15], [1175, 0.14, 0.3]],
  click: [[1200, 0, 0.04]],
  blip: [[900, 0, 0.025]],
  fail: [[392, 0, 0.2], [330, 0.18, 0.2], [262, 0.36, 0.4]],
};

// Um fade por elemento: dois ao mesmo tempo brigam pelo volume e o mais longo vence no final
// (ex.: a música ficava presa no volume abaixado se a faixa trocasse durante uma fala).
const fadeTokens = new WeakMap<HTMLAudioElement, number>();

function cancelFade(el: HTMLAudioElement): number {
  const token = (fadeTokens.get(el) || 0) + 1;
  fadeTokens.set(el, token);
  return token;
}

/** Leva o volume até `target`; resolve com false se outro fade assumiu o elemento antes do fim. */
function fadeTo(el: HTMLAudioElement, target: number, ms: number): Promise<boolean> {
  const token = cancelFade(el);
  const start = el.volume;
  const t0 = performance.now();
  return new Promise((resolve) => {
    const step = (now: number): void => {
      if (fadeTokens.get(el) !== token) { resolve(false); return; }
      const k = Math.min(1, (now - t0) / ms);
      el.volume = Math.max(0, Math.min(1, start + (target - start) * k));
      if (k < 1) requestAnimationFrame(step); else resolve(true);
    };
    requestAnimationFrame(step);
  });
}

/** Música com crossfade, falas (MP3 ou voz do navegador) e efeitos sintetizados via WebAudio. */
export class WebAudioPlayer implements AudioPort {
  private ctx: AudioContext | null = null;
  private playlist: string[] = [];
  private trackIndex = 0;
  private readonly bgm = [new Audio(), new Audio()];
  private active = 0;
  private ducked = 0;
  private suspended = false;
  private fadeTimer: ReturnType<typeof setInterval> | undefined;
  private readonly voice = new Audio();
  private voiceDone: (() => void) | null = null;

  constructor(private readonly getSettings: () => SettingsDto | null) {
    this.voice.preload = 'auto';
  }

  private settings(): AudioSettings {
    return this.getSettings() || DEFAULTS;
  }

  private musicTarget(): number {
    const s = this.settings();
    if (!s.music_on) return 0;
    return this.ducked ? Math.min(DUCK_LEVEL, s.music_volume) : s.music_volume;
  }

  private playTrack(i: number): void {
    if (!this.playlist.length) return;
    this.trackIndex = i % this.playlist.length;
    const prev = this.bgm[this.active];
    this.active = 1 - this.active;
    const next = this.bgm[this.active];
    cancelFade(next); // um fade de saída pendente pausaria a faixa que acabou de começar
    next.src = this.playlist[this.trackIndex];
    next.volume = 0;
    next.play().then(() => fadeTo(next, this.musicTarget(), CROSSFADE_MS)).catch(() => {});
    if (!prev.paused) void fadeTo(prev, 0, CROSSFADE_MS).then((done) => { if (done) prev.pause(); });

    // Inicia o crossfade para a próxima faixa um pouco antes desta acabar.
    clearInterval(this.fadeTimer);
    this.fadeTimer = setInterval(() => {
      if (next.duration && next.currentTime > next.duration - CROSSFADE_MS / 1000 - 0.2) {
        clearInterval(this.fadeTimer);
        this.playTrack(this.trackIndex + 1);
      }
    }, 500);
  }

  unlock(): void {
    if (!this.ctx) {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AC = w.AudioContext || w.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    void this.ctx?.resume?.();
  }

  startMusic(urls: string[]): void {
    this.playlist = urls;
    if (this.settings().music_on && this.playlist.length) this.playTrack(0);
  }

  applySettings(): void {
    const s = this.settings();
    this.voice.volume = s.voice_volume;
    const cur = this.bgm[this.active];
    if (s.music_on && !this.suspended) {
      if (cur.paused && this.playlist.length) this.playTrack(this.trackIndex);
      else void fadeTo(cur, this.musicTarget(), 250);
    } else {
      this.bgm.forEach((el) => fadeTo(el, 0, 250).then((done) => { if (done) el.pause(); }));
      clearInterval(this.fadeTimer);
    }
  }

  suspendMusic(on: boolean): void {
    if (this.suspended === on) return;
    this.suspended = on;
    this.applySettings();
  }

  duck(on: boolean): void {
    this.ducked = Math.max(0, this.ducked + (on ? 1 : -1));
    const cur = this.bgm[this.active];
    if (!cur.paused) void fadeTo(cur, this.musicTarget(), DUCK_MS);
  }

  speak(url: string | null, fallbackText?: string): Promise<void> {
    this.stopVoice();
    this.duck(true);
    const voice = this.voice;
    return new Promise((resolve) => {
      let finished = false;
      const finish = (): void => {
        if (finished) return;
        finished = true;
        this.voiceDone = null;
        voice.onended = voice.onerror = null;
        this.duck(false);
        resolve();
      };
      this.voiceDone = finish;
      if (url) {
        voice.src = url;
        voice.volume = this.settings().voice_volume;
        voice.onended = voice.onerror = finish;
        voice.play().catch(finish);
      } else if (fallbackText && 'speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(fallbackText);
        u.lang = 'ja-JP';
        u.volume = this.settings().voice_volume;
        u.onend = u.onerror = finish;
        speechSynthesis.speak(u);
      } else {
        finish();
      }
    });
  }

  stopVoice(): void {
    if (!this.voice.paused) this.voice.pause();
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    this.voiceDone?.();
  }

  sfx(name: SfxName): void {
    const s = this.settings();
    const ctx = this.ctx;
    if (!s.sfx_on || !ctx) return;
    const seq = NOTES[name];
    if (!seq) return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = s.sfx_volume * (name === 'blip' ? 0.15 : 0.35);
    master.connect(ctx.destination);
    for (const [freq, at, dur, type = 'sine'] of seq) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + at);
      g.gain.exponentialRampToValueAtTime(1, now + at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur);
      osc.connect(g).connect(master);
      osc.start(now + at);
      osc.stop(now + at + dur + 0.05);
    }
  }
}
