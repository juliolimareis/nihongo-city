import type { AudioPort, SpeechRecognizer } from '../application/ports';
import { RecognitionImpl, isPermissionError } from './speech-recognition';

/** Reconhecimento de voz local (Web Speech API, ja-JP). */
export class WebSpeechRecognizer implements SpeechRecognizer {
  readonly supported = !!RecognitionImpl;
  denied = false;

  constructor(private readonly audio: Pick<AudioPort, 'duck'>) {}

  listen({ onStart, timeoutMs = 8000 }: { onStart?: () => void; timeoutMs?: number } = {}): Promise<string[]> {
    const Recognition = RecognitionImpl;
    if (!Recognition) return Promise.reject(new Error('unsupported'));
    return new Promise((resolve, reject) => {
      const rec = new Recognition();
      rec.lang = 'ja-JP';
      rec.interimResults = false;
      rec.maxAlternatives = 5;
      rec.continuous = false;

      let results: string[] = [];
      let settled = false;
      const timer = setTimeout(() => rec.stop(), timeoutMs);
      const done = <T>(fn: (value: T) => void, value: T): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.audio.duck(false);
        fn(value);
      };

      rec.onstart = () => { this.audio.duck(true); onStart?.(); };
      rec.onresult = (e) => {
        results = [];
        for (const res of Array.from(e.results)) {
          for (const alt of Array.from(res)) if (alt.transcript) results.push(alt.transcript.trim());
        }
      };
      rec.onerror = (e) => {
        if (isPermissionError(e.error)) {
          this.denied = true;
          done(reject, new Error('denied'));
        } else if (e.error === 'no-speech' || e.error === 'aborted') {
          done(resolve, []);
        } else {
          done(reject, new Error(e.error));
        }
      };
      rec.onend = () => done(resolve, results);
      try {
        rec.start();
      } catch (err) {
        done(reject, err);
      }
    });
  }
}
