import type { PlayerDto, SceneDto, SettingsDto, StatsDto } from '../../shared/contracts';

export type StoreEvent = 'profile' | 'refresh-profile' | 'settings' | 'remote' | 'event-closed';

export interface GameState {
  player: PlayerDto | null;
  settings: SettingsDto | null;
  stats: StatsDto;
  scenes: SceneDto[];
  eventOpen: boolean;
  modalOpen: boolean;
  lastInteraction: number;
}

/** Estado compartilhado do jogo (jogador, configurações e o que está aberto na tela). */
export class Store {
  readonly state: GameState = {
    player: null,
    settings: null,
    stats: { cards: 0, due: 0, dueToday: 0, events: 0, successes: 0 },
    scenes: [],
    eventOpen: false,
    modalOpen: false,
    lastInteraction: Date.now(),
  };

  private readonly listeners = new Set<(what: StoreEvent) => void>();

  /** Jogador logado (só existe depois da tela inicial). */
  get player(): PlayerDto {
    if (!this.state.player) throw new Error('Nenhum jogador conectado');
    return this.state.player;
  }

  get settings(): SettingsDto {
    if (!this.state.settings) throw new Error('Configurações não carregadas');
    return this.state.settings;
  }

  /** Registra um ouvinte; devolve a função que o remove. */
  onChange(fn: (what: StoreEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  emit(what: StoreEvent): void {
    this.listeners.forEach((fn) => fn(what));
  }
}
