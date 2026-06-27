import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType, type z } from 'zod';
import { ValidationError } from '../errors/validation.error.js';

interface ValidationSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

type InferOrUndefined<T extends ZodType | undefined> = T extends ZodType ? z.infer<T> : undefined;

function parseSchemas(schemas: ValidationSchemas, req: Request) {
  const validatedQuery = schemas.query ? schemas.query.parse(req.query) : undefined;
  const validatedParams = schemas.params ? schemas.params.parse(req.params) : undefined;

  if (schemas.body) req.body = schemas.body.parse(req.body);
  return { validatedQuery, validatedParams };
}

function toValidationError(err: unknown): ValidationError | unknown {
  if (!(err instanceof ZodError)) return err;
  const details = err.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  return new ValidationError('Request validation failed', details);
}

export function validatedRoute<S extends ValidationSchemas>(
  schemas: S,
  handler: (
    req: Request & {
      validatedQuery: InferOrUndefined<S['query']>;
      validatedParams: InferOrUndefined<S['params']>;
    },
    res: Response,
    next: NextFunction,
  ) => void | Promise<void>,
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { validatedQuery, validatedParams } = parseSchemas(schemas, req);

      const narrowedReq = req as Request & {
        validatedQuery: InferOrUndefined<S['query']>;
        validatedParams: InferOrUndefined<S['params']>;
      };
      narrowedReq.validatedQuery = validatedQuery as InferOrUndefined<S['query']>;
      narrowedReq.validatedParams = validatedParams as InferOrUndefined<S['params']>;

      Promise.resolve(handler(narrowedReq, res, next)).catch(next);
    } catch (err) {
      next(toValidationError(err));
    }
  };
}
