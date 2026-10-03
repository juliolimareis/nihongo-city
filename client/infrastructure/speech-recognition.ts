// Tipos mínimos da Web Speech API (prefixada como webkitSpeechRecognition no Chrome).

export interface RecognitionAlternative {
  transcript: string;
}

export interface RecognitionResult extends ArrayLike<RecognitionAlternative> {
  isFinal: boolean;
  [index: number]: RecognitionAlternative;
}

export interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>;
}

export interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onstart: (() => void) | null;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export type RecognitionCtor = new () => Recognition;

const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };

export const RecognitionImpl: RecognitionCtor | undefined = w.SpeechRecognition || w.webkitSpeechRecognition;

export const isPermissionError = (error: string): boolean => error === 'not-allowed' || error === 'service-not-allowed';
