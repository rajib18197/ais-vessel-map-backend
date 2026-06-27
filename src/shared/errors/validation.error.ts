import { AppError } from './app.error.js';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

/** Thrown when request params/query/body fail Zod validation. */
export class ValidationError extends AppError {
  public readonly details: ValidationErrorDetail[];

  constructor(message: string, details: ValidationErrorDetail[] = []) {
    super(message, 400);
    this.details = details;

    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}
