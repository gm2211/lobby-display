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
  err: Error & { status?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log error for debugging
  console.error(`[Error] ${err.name}: ${err.message}`);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  // Determine status code
  const status = err.status || 500;

  // Build response
  const response: { error: string; message: string; stack?: string } = {
    error: err.name || 'Error',
    message: err.message || 'An unexpected error occurred',
  };

  // Include stack trace in development
  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.stack = err.stack;
  }

  res.status(status).json(response);
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
