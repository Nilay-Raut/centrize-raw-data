import type { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express handler to catch any errors and forward them to next().
 * This also avoids 'no-misused-promises' lint errors by returning void.
 */
export function catchAsync(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    void fn(req, res, next).catch(next);
  };
}
