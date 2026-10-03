import type { NextFunction, Request, Response } from 'express';
import { DomainError, NotFoundError, ValidationError } from '../../domain/shared/errors';

interface HttpLikeError extends Error {
  status?: number;
  expose?: boolean;
}

function statusOf(err: unknown): number {
  if (err instanceof NotFoundError) return 404;
  if (err instanceof ValidationError) return 400;
  return (err as HttpLikeError).status || 500;
}

/** Traduz erros de domínio para HTTP; erros inesperados viram 500 sem detalhes. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const status = statusOf(err);
  const expose = err instanceof DomainError || (err as HttpLikeError).expose;
  if (!(err instanceof DomainError)) console.error(err);
  res.status(status).json({ error: expose ? (err as Error).message : 'Erro interno' });
}

export function apiNotFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Rota não encontrada' });
}
