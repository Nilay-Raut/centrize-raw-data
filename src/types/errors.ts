/**
 * Typed error hierarchy for Campaign Data Platform.
 *
 * All service-layer errors are thrown as subclasses of AppError.
 * The central errorHandler.ts middleware catches these and formats the HTTP response.
 *
 * NEVER throw plain Error objects from service files.
 * NEVER call res.json() with error details from route files — throw AppError instead.
 */

export class AppError extends Error {
  constructor(
    public readonly message: string,
    public readonly code: string,
    public readonly statusCode: number,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    // Maintain proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/** 400 — Invalid input, missing required fields, validation failure */
export class ValidationError extends AppError {
  constructor(message: string, fields?: Record<string, string>) {
    super(message, 'VALIDATION_FAILED', 400, fields ? { fields } : undefined);
  }
}

/** 401 — No valid authentication credential provided */
export class UnauthorisedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORISED', 401);
  }
}

/** 403 — Credential is valid but does not have permission for this action */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
  }
}

/** 404 — Requested resource does not exist */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource} not found${id ? `: ${id}` : ''}`,
      'NOT_FOUND',
      404,
      id ? { resource, id } : { resource },
    );
  }
}

/** 409 — Conflict (e.g. duplicate segment name on a locked operation) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONFLICT', 409);
  }
}

/** 413 — Uploaded file exceeds the size limit */
export class FileTooLargeError extends AppError {
  constructor(limitBytes: number) {
    super(
      `File exceeds the maximum allowed size of ${Math.round(limitBytes / 1_048_576)}MB`,
      'FILE_TOO_LARGE',
      413,
      { limitBytes },
    );
  }
}

/** 429 — Rate limit exceeded for this platform */
export class RateLimitError extends AppError {
  constructor(platform: string, limit: number, windowSeconds: number, retryAfter: number) {
    super(
      `Rate limit exceeded for platform: ${platform}`,
      'RATE_LIMIT_EXCEEDED',
      429,
      { platform, limit, window_seconds: windowSeconds, retry_after: retryAfter },
    );
  }
}

/** 500 — Unexpected internal error */
export class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred') {
    super(message, 'INTERNAL_ERROR', 500);
  }
}

/** 503 — Server is too busy (event loop lag > threshold) */
export class ServerBusyError extends AppError {
  constructor() {
    super('Server is too busy. Please retry shortly.', 'SERVER_BUSY', 503);
  }
}
