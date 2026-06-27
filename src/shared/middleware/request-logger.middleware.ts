import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from '../logger/logger.js';

declare global {
  // I'm disabling no-namespace here because Express module augmentation requires namespace Express — there is no ES module syntax that achieves the same global type extension.
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
      log: typeof logger;
    }
  }
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  const startedAt = process.hrtime.bigint();

  req.id = requestId;
  req.log = logger.child({ requestId });
  res.setHeader('x-request-id', requestId);

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    const logPayload = {
      requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ip: req.ip,
    };

    if (res.statusCode >= 500) {
      logger.error(logPayload, 'Request completed with server error');
    } else if (res.statusCode >= 400) {
      logger.warn(logPayload, 'Request completed with client error');
    } else {
      logger.info(logPayload, 'Request completed');
    }
  });

  next();
}
