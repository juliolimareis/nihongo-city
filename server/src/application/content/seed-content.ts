import { type ContentCatalog, validateCatalog } from '../../domain/content/catalog';
import { ValidationError } from '../../domain/shared/errors';

export interface ContentSource {
  load(): ContentCatalog;
}

export interface ContentWriter {
  /** Grava (upsert) todo o catálogo de forma atômica. */
  write(catalog: ContentCatalog): void;
  summary(): string;
}

/** Valida o catálogo dos JSON e o grava no banco. */
export class SeedContent {
  constructor(private readonly source: ContentSource, private readonly writer: ContentWriter) {}

  execute(): string {
    const catalog = this.source.load();
    const errors = validateCatalog(catalog);
    if (errors.length) throw new ValidationError('Seed inválido:\n  ' + errors.join('\n  '));
    this.writer.write(catalog);
    return this.writer.summary();
  }
}
