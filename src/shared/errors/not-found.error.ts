import type { Request, Response, NextFunction } from 'express';
import { AppError } from './app.error.js';

/** 404 catch-all */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
}
