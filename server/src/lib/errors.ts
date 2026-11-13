import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiError } from '@shared/types';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let body: ApiError = { error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error' } };

  if (err instanceof ZodError) {
    status = 400;
    body = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request parameters',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
  } else if (isJsonParseError(err)) {
    status = 400;
    body = { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON' } };
  } else if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else {
    console.error('[error]', err);
  }

  res.status(status).json(body);
};

/** express.json() rejects malformed bodies with this shape. */
function isJsonParseError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: unknown }).type === 'entity.parse.failed'
  );
}

/** Short, user-readable message from an unknown thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
