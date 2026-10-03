/** Erros de regra de negócio; a borda HTTP traduz cada tipo para um status. */
export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Algo pedido não existe (jogador, evento, carta…). */
export class NotFoundError extends DomainError {}

/** A entrada viola uma regra (avaliação inválida, nome vazio…). */
export class ValidationError extends DomainError {}
