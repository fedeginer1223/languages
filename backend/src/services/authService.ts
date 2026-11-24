import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../utils/prisma';

const BCRYPT_COST = 12;
const DEV_SECRET = 'dev-only-insecure-secret-change-me';

export function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET es obligatorio en producción');
  }
  return DEV_SECRET;
}

/** Fail fast at startup. */
export function assertAuthConfig(): void {
  if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET es obligatorio en producción');
    }
    console.warn('[auth] SESSION_SECRET no definido: usando un secreto de desarrollo');
  }
}

export async function createUser(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  return prisma.user.upsert({
    where: { email: email.trim().toLowerCase() },
    update: { passwordHash },
    create: { email: email.trim().toLowerCase(), passwordHash },
    select: { id: true, email: true },
  });
}

export async function login(email: string, password: string): Promise<{ id: string; email: string } | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) {
    // Compare against a dummy hash to keep timing similar.
    await bcrypt.compare(password, '$2a$12$C6UzMDM.H6dfI/f/IKcEeO5x1kGq6bZ2xk1YkG5nQe1B1h0rQy9aa');
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { id: user.id, email: user.email };
}

export function issueToken(userId: string): string {
  return jwt.sign({ sub: userId }, getSessionSecret(), { algorithm: 'HS256', expiresIn: '30d' });
}

export function verifyToken(token: string): { userId: string } | null {
  try {
    const payload = jwt.verify(token, getSessionSecret(), { algorithms: ['HS256'] });
    if (typeof payload === 'object' && typeof payload.sub === 'string') return { userId: payload.sub };
    return null;
  } catch {
    return null;
  }
}
