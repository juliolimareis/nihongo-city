import type {
  DueCardsResponse,
  AttemptRequest, AttemptResponse, CardDto, CardFilter, FinishEventRequest, FinishEventResponse, InviteDto,
  LoginResponse, PairingDto, ProfileDto, Rating, RemoteAction, RemoteScreen, RemoteState, SceneDto, SettingsDto,
  StartEventRequest, StartEventResponse, StudyMode, TvLibraryDto, TvTranscriptDto, TvVideoDetailDto,
} from '../../shared/contracts';

// Portas que a UI usa; os adaptadores concretos ficam em infrastructure/ e são ligados em app/main.ts.

export interface GameApi {
  /** O nome é a chave: se já existir, volta com o progresso salvo. */
  login(name: string): Promise<LoginResponse>;
  getPlayer(id: number | string): Promise<ProfileDto>;
  saveSettings(id: number, patch: Partial<SettingsDto>): Promise<SettingsDto>;
  resetProgress(id: number): Promise<ProfileDto>;
  scenes(): Promise<SceneDto[]>;
  music(): Promise<string[]>;
  startEvent(body: StartEventRequest): Promise<StartEventResponse>;
  attempt(eventId: number, body: AttemptRequest): Promise<AttemptResponse>;
  finishEvent(eventId: number, body: FinishEventRequest): Promise<FinishEventResponse>;
  /** null quando não há convite disponível. */
  nextInvite(player: number): Promise<InviteDto | null>;
  readings(texts: string[]): Promise<{ readings: string[] }>;
  cards(player: number, filter?: CardFilter): Promise<CardDto[]>;
  dueCards(player: number, limit?: number): Promise<DueCardsResponse>;
  review(player: number, exprId: string, mode: StudyMode, rating: Rating): Promise<CardDto>;
  /** Vídeos de "Estudar com TV", com a parte em que o jogador parou em cada um. */
  tvLibrary(player: number): Promise<TvLibraryDto>;
  tvVideo(player: number, videoId: string): Promise<TvVideoDetailDto>;
  tvTranscript(videoId: string, part: number): Promise<TvTranscriptDto>;
  saveTvProgress(player: number, videoId: string, part: number): Promise<unknown>;
}

export type SfxName = 'correct' | 'wrong' | 'card' | 'notify' | 'click' | 'blip' | 'fail';

export interface AudioPort {
  /** Precisa ser chamado dentro de um gesto do usuário (política de autoplay). */
  unlock(): void;
  startMusic(urls: string[]): void;
  applySettings(): void;
  duck(on: boolean): void;
  /** Para a música enquanto outra mídia toca (rádio/TV) e a retoma depois. */
  suspendMusic(on: boolean): void;
  /** Toca uma fala; resolve quando termina ou é interrompida. Sem arquivo, usa a voz do navegador. */
  speak(url: string | null, fallbackText?: string): Promise<void>;
  stopVoice(): void;
  sfx(name: SfxName): void;
}

export interface SpeechRecognizer {
  readonly supported: boolean;
  readonly denied: boolean;
  /**
   * Ouve o microfone em japonês e devolve as transcrições candidatas.
   * Resolve com [] se nada foi entendido; rejeita (Error('denied')) se o microfone for negado.
   */
  listen(options?: { onStart?: () => void; timeoutMs?: number }): Promise<string[]>;
}

/** Celular como microfone: a TV publica o que mostra e recebe as falas reconhecidas no celular. */
export interface RemoteMicrophone {
  readonly connected: boolean;
  /** Publica no celular o que a TV está mostrando. */
  setState(state: RemoteState): void;
  /** Pede ao celular uma fala; resolve com null se for cancelado. */
  listen(screen: RemoteScreen): Promise<string[] | null>;
  cancelListen(): void;
  /** Dados do QR da sessão atual (cria uma se não houver). */
  pairing(): Promise<PairingDto>;
  /** Descarta a sessão atual e cria outra. */
  renewSession(): Promise<PairingDto>;
  /** Reaproveita a sessão ao recarregar a página da TV (se o servidor ainda a conhece). */
  resume(): void;
  onConnectionChange(listener: (connected: boolean) => void): void;
  onAction(listener: (action: RemoteAction) => void): void;
}

export type SubtitleMode = 'off' | 'ja' | 'pt';

/** Preferências de "Estudar com TV" guardadas neste navegador. */
export interface TvPrefsStore {
  subtitles(): SubtitleMode;
  setSubtitles(mode: SubtitleMode): void;
}

export interface PlayerIdStore {
  get(): string | null;
  set(id: number): void;
  clear(): void;
}
