import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const hits = new Map<string, { count: number; resetAt: number }>();

function extractKey(req: Request): string | null {
  const header = req.header('x-api-key');
  if (header && header.trim()) return header.trim();
  const auth = req.header('authorization');
  if (auth) {
    const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
    if (m) return m[1].trim();
  }
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function rateLimited(id: string): boolean {
  const now = Date.now();
  if (hits.size > 1000) {
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }
  const entry = hits.get(id);
  if (!entry || entry.resetAt <= now) {
    hits.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_REQUESTS;
}

/**
 * Protects /api/v1/ext/* with EXTERNAL_API_KEY (header X-API-Key or
 * Authorization: Bearer). Handlers may set res.locals.extCreated for the log line.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.EXTERNAL_API_KEY;
  if (!expected || !expected.trim()) {
    return res.status(503).json({ error: 'external_api_disabled' });
  }
  const provided = extractKey(req);
  if (!provided || !safeEqual(provided, expected)) {
    return res.status(401).json({ error: 'invalid_api_key' });
  }
  if (rateLimited(provided || req.ip || 'unknown')) {
    return res.status(429).json({ error: 'rate_limited' });
  }
  res.on('finish', () => {
    console.log(
      `[ext] ${req.method} ${req.originalUrl.split('?')[0]} key=${provided.slice(0, 4)}… ip=${req.ip} status=${res.statusCode} created=${res.locals.extCreated ?? 0}`
    );
  });
  next();
}
