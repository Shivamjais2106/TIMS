/**
 * Error type understood by the centralised error handler. Anything else that
 * reaches the handler is treated as an unexpected 500 and its message is never
 * leaked to the client in production.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, message: string, code = 'ERROR', details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message = 'Bad request', details?: unknown): ApiError {
    return new ApiError(400, message, 'BAD_REQUEST', details);
  }

  static unauthorized(message = 'Authentication required'): ApiError {
    return new ApiError(401, message, 'UNAUTHORIZED');
  }

  static forbidden(message = 'You do not have permission to perform this action'): ApiError {
    return new ApiError(403, message, 'FORBIDDEN');
  }

  static notFound(message = 'Resource not found'): ApiError {
    return new ApiError(404, message, 'NOT_FOUND');
  }

  static conflict(message = 'Resource already exists'): ApiError {
    return new ApiError(409, message, 'CONFLICT');
  }

  static unprocessable(message = 'Validation failed', details?: unknown): ApiError {
    return new ApiError(422, message, 'VALIDATION_ERROR', details);
  }

  static serviceUnavailable(message = 'Service unavailable', details?: unknown): ApiError {
    return new ApiError(503, message, 'SERVICE_UNAVAILABLE', details);
  }
}
