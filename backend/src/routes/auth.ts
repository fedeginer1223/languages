import { Router } from 'express';
import { z } from 'zod';
import { login, issueToken } from '../services/authService';
import { requireAuth, SESSION_COOKIE } from '../middleware/auth';
import { prisma } from '../utils/prisma';

export const authRouter = Router();

const MAX_FAILS = 10;
const WINDOW_MS = 15 * 60 * 1000;
const fails = new Map<string, { count: number; resetAt: number }>();

function isLimited(ip: string): boolean {
  const e = fails.get(ip);
  if (!e) return false;
  if (e.resetAt < Date.now()) {
    fails.delete(ip);
    return false;
  }
  return e.count >= MAX_FAILS;
}

function registerFail(ip: string) {
  const now = Date.now();
  const e = fails.get(ip);
  if (!e || e.resetAt < now) fails.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else e.count++;
}

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
});

const loginSchema = z.object({ email: z.string().min(1), password: z.string().min(1) });

authRouter.post('/login', async (req, res, next) => {
  try {
    const ip = req.ip || 'unknown';
    if (isLimited(ip)) return res.status(429).json({ error: 'too_many_attempts' });
    const parsed = loginSchema.safeParse(req.body);
    const user = parsed.success ? await login(parsed.data.email, parsed.data.password) : null;
    if (!user) {
      registerFail(ip);
      await new Promise((r) => setTimeout(r, 300));
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    fails.delete(ip);
    res.cookie(SESSION_COOKIE, issueToken(user.id), { ...cookieOptions(), maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, cookieOptions());
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, email: true },
    });
    if (!user) return res.status(401).json({ error: 'unauthorized' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});
