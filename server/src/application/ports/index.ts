// Portas de saída técnicas usadas pelos casos de uso (implementadas na infraestrutura).

export interface Clock {
  now(): Date;
}

/** Executa um bloco de forma atômica (tudo ou nada). */
export interface UnitOfWork {
  run<T>(work: () => T): T;
}

/** Leitura em hiragana de um texto japonês (kanji → kana). */
export interface ReadingService {
  reading(text: string): string;
}

/** Faixas de música de fundo disponíveis (nomes de arquivo). */
export interface MusicCatalog {
  list(): string[];
}

export interface QrCodeGenerator {
  svg(text: string): Promise<string>;
}

export interface NetworkInfo {
  /** IPs da rede local, do mais provável (192.168.x) ao menos provável. */
  lanAddresses(): string[];
}

/** Endereço público do servidor HTTPS (o celular precisa dele para usar o microfone). */
export interface HttpsEndpoint {
  readonly publicHost: string | null;
  /** URL base completa (túnel/proxy reverso); quando definida, substitui host e porta. */
  readonly publicUrl: string | null;
  port(): number | null;
}
