/**
 * Error Handling Middleware - Centralized error handling for Express routes.
 *
 * PURPOSE:
 * Provides consistent error responses and prevents unhandled promise rejections
 * from crashing the server.
 *
 * EXPORTS:
 * - asyncHandler: Wraps async route handlers to catch errors
 * - errorHandler: Express error middleware (register as LAST middleware)
 * - NotFoundError: 404 error class
 * - ValidationError: 400 error class
 *
 * USAGE:
 * ```typescript
 * import { asyncHandler, NotFoundError } from '../middleware/errorHandler';
 *
 * router.get('/:id', asyncHandler(async (req, res) => {
 *   const item = await prisma.item.findUnique({ where: { id: Number(req.params.id) } });
 *   if (!item) throw new NotFoundError('Item not found');
 *   res.json(item);
 * }));
 * ```
 *
 * GOTCHAS / AI AGENT NOTES:
 * - asyncHandler MUST wrap all async route handlers to catch errors
 * - errorHandler MUST be registered AFTER all routes in index.ts
 * - In development, stack traces are included in error responses
 * - 5xx responses never include the raw error message (it can leak Prisma/SQL
 *   internals); throw ValidationError/NotFoundError for anything users should read
 * - ValidationError and NotFoundError set appropriate HTTP status codes
 *
 * RELATED FILES:
 * - server/index.ts - registers errorHandler middleware
 * - server/utils/createCrudRoutes.ts - uses asyncHandler
 */
import { Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Custom error class for 404 Not Found errors.
 */
export class NotFoundError extends Error {
  status = 404;
  constructor(message = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Custom error class for 400 Validation errors.
 */
export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Wraps an async route handler to catch errors and pass them to Express error middleware.
 *
 * Without this, async errors would cause unhandled promise rejections.
 *
 * @param fn - Async route handler function
 * @returns Wrapped handler that catches errors
 *
 * @example
 * router.get('/', asyncHandler(async (req, res) => {
 *   const items = await prisma.item.findMany();
 *   res.json(items);
 * }));
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Express error handling middleware.
 *
 * Converts errors to JSON responses with appropriate status codes.
 * Must be registered AFTER all routes.
 *
 * @example
 * // In server/index.ts:
 * app.use('/api/services', servicesRouter);
 * app.use('/api/events', eventsRouter);
 * app.use(errorHandler); // MUST be last
 */
export function errorHandler(
  err: Error & { status?: number; statusCode?: number; code?: string; type?: string },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProd = process.env.NODE_ENV === 'production';

  // Log error for debugging (full detail stays in the server log)
  console.error(`[Error] ${err.name}: ${err.message}`);
  if (!isProd) {
    console.error(err.stack);
  }

  const { status, name, message } = describeError(err);

  // Build response
  const response: { error: string; message: string; stack?: string } = {
    error: name,
    message,
  };

  // Include stack trace in development
  if (!isProd && err.stack) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
}

/**
 * Decide what a client is told about an error.
 *
 * Our own errors (ValidationError, NotFoundError, auth errors) carry a status and a
 * message written for users, so they pass through. Anything else is an internal
 * failure: its message can contain Prisma queries, column names or file paths, so
 * clients get a generic message instead. Common Prisma failures caused by bad input
 * are translated to 4xx so the admin UI shows something useful.
 */
function describeError(
  err: Error & { status?: number; statusCode?: number; code?: string; type?: string },
): { status: number; name: string; message: string } {
  // Malformed or oversized JSON body (thrown by express.json)
  if (err.type === 'entity.parse.failed') {
    return { status: 400, name: 'ValidationError', message: 'Request body is not valid JSON' };
  }
  if (err.type === 'entity.too.large') {
    return { status: 413, name: 'ValidationError', message: 'Request body is too large' };
  }

  if (err.name === 'PrismaClientValidationError') {
    return { status: 400, name: 'ValidationError', message: 'Invalid request data' };
  }
  if (err.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      return { status: 409, name: 'ConflictError', message: 'An item with that name already exists' };
    }
    if (err.code === 'P2025') {
      return { status: 404, name: 'NotFoundError', message: 'Resource not found' };
    }
    if (err.code === 'P2003') {
      return { status: 409, name: 'ConflictError', message: 'This item is still referenced by other data' };
    }
  }

  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    return { status, name: 'InternalServerError', message: 'Something went wrong. Please try again.' };
  }
  return {
    status,
    name: err.name || 'Error',
    message: err.message || 'An unexpected error occurred',
  };
}

/**
 * Validates that a parameter is a valid positive integer.
 * Throws ValidationError if invalid.
 *
 * @param value - The value to validate (usually req.params.id)
 * @param name - Parameter name for error message
 * @returns The parsed integer
 *
 * @example
 * const id = validateId(req.params.id, 'id');
 * const item = await prisma.item.findUnique({ where: { id } });
 */
export function validateId(value: string, name = 'id'): number {
  const num = Number(value);
  if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
    throw new ValidationError(`Invalid ${name}: must be a positive integer`);
  }
  return num;
}
