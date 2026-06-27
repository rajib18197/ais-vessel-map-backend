import type { Request, Response, NextFunction } from 'express';
import { Error as MongooseError } from 'mongoose';
import { ZodError } from 'zod';
import { AppError } from '../errors/app.error.js';
import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';
import { MongoServerError } from 'mongodb';

function handleCastErrorDB(err: MongooseError.CastError): AppError {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
}

function handleDuplicateFieldsDB(err: MongoServerError): AppError {
  const [field, value] = Object.entries(err.keyValue ?? {})[0] ?? ['field', 'value'];
  const message = `Duplicate ${field}: "${value}". A vessel with this ${field} already exists.`;
  return new AppError(message, 400);
}

function handleValidationErrorDB(err: MongooseError.ValidationError): AppError {
  const errors = Object.values(err.errors).map((el) => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new AppError(message, 400);
}

function handleZodError(err: ZodError): AppError {
  const message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('. ');
  return new AppError(message, 400);
}

function sendErrorDev(err: AppError, _req: Request, res: Response): void {
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    stack: err.stack,
  });
}

function sendErrorProd(err: AppError, _req: Request, res: Response): void {
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
    return;
  }

  logger.error({ err }, 'Unhandled non-operational error');
  res.status(500).json({
    status: 'error',
    message: 'Something went wrong',
  });
}

export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let error: AppError;

  if (err instanceof AppError) {
    error = err;
  } else if (err instanceof MongooseError.CastError) {
    error = handleCastErrorDB(err);
  } else if (err instanceof MongooseError.ValidationError) {
    error = handleValidationErrorDB(err);
  } else if ((err as MongoServerError).code === 11000) {
    error = handleDuplicateFieldsDB(err as MongoServerError);
  } else if (err instanceof ZodError) {
    error = handleZodError(err);
  } else {
    logger.error({ err }, 'Unhandled non-operational error caught by global handler');
    error = new AppError('Something went wrong', 500);
  }

  if (env.NODE_ENV === 'development') {
    sendErrorDev(error, req, res);
  } else {
    sendErrorProd(error, req, res);
  }
}
