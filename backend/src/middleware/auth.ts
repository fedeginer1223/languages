import { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../services/authService';

export const SESSION_COOKIE = 'll_session';

declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string };
  }
}

/**
 * Public API paths (no session needed).
 * /api/v1/ext/* is reserved for a future external API protected by an API key
 * (EXTERNAL_API_KEY) instead of the session cookie.
 */
export function isPublicPath(path: string): boolean {
  return (
    path === '/api/v1/auth' ||
    path.startsWith('/api/v1/auth/') ||
    path === '/api/v1/ext' ||
    path.startsWith('/api/v1/ext/')
  );
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  const verified = typeof token === 'string' ? verifyToken(token) : null;
  if (!verified) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  req.user = { id: verified.userId };
  next();
}

/** Applies requireAuth to every /api/ path that is not public. */
export function protectApi(req: Request, res: Response, next: NextFunction) {
  if (!req.path.startsWith('/api/') || isPublicPath(req.path)) return next();
  return requireAuth(req, res, next);
}
