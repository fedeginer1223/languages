import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma';

/**
 * Per-user data isolation. Each resolver answers "does resource <id> belong to
 * user <userId>?" with a single query. Failures respond 404 (not 403) so the
 * existence of other users' data is not leaked.
 */
const U = (userId: string) => ({ userId });

const resolvers = {
  language: async (id: string, userId: string) =>
    !!(await prisma.language.findFirst({ where: { id, userId }, select: { id: true } })),
  topic: async (id: string, userId: string) =>
    !!(await prisma.topic.findFirst({ where: { id, language: U(userId) }, select: { id: true } })),
  word: async (id: string, userId: string) =>
    !!(await prisma.word.findFirst({ where: { id, topic: { language: U(userId) } }, select: { id: true } })),
  verb: async (id: string, userId: string) =>
    !!(await prisma.verb.findFirst({ where: { id, language: U(userId) }, select: { id: true } })),
  conjugation: async (id: string, userId: string) =>
    !!(await prisma.verbConjugation.findFirst({ where: { id, verb: { language: U(userId) } }, select: { id: true } })),
  essay: async (id: string, userId: string) =>
    !!(await prisma.essay.findFirst({ where: { id, language: U(userId) }, select: { id: true } })),
  error: async (id: string, userId: string) =>
    !!(await prisma.error.findFirst({
      where: { id, correction: { essay: { language: U(userId) } } },
      select: { id: true },
    })),
  grammar: async (id: string, userId: string) =>
    !!(await prisma.grammarItem.findFirst({ where: { id, language: U(userId) }, select: { id: true } })),
  structure: async (id: string, userId: string) =>
    !!(await prisma.structure.findFirst({ where: { id, language: U(userId) }, select: { id: true } })),
  structureExample: async (id: string, userId: string) =>
    !!(await prisma.structureExample.findFirst({
      where: { id, structure: { language: U(userId) } },
      select: { id: true },
    })),
  book: async (id: string, userId: string) =>
    !!(await prisma.book.findFirst({ where: { id, language: U(userId) }, select: { id: true } })),
};

export type OwnedResource = keyof typeof resolvers;

/** True if the logged-in user owns the resource. */
export async function isOwned(req: Request, resource: OwnedResource, id: unknown): Promise<boolean> {
  const userId = req.user?.id;
  if (!userId || typeof id !== 'string' || !id) return false;
  return resolvers[resource](id, userId);
}

const notFound = (res: Response) => res.status(404).json({ error: 'Not found' });

/** Handler for router.param(name, ownedParam('language')). */
export const ownedParam =
  (resource: OwnedResource) => async (req: Request, res: Response, next: NextFunction, value: string) => {
    try {
      if (!(await isOwned(req, resource, value))) return notFound(res);
      next();
    } catch (err) {
      next(err);
    }
  };

/** Route-level middleware: checks req.params[param] (default 'id'). */
export const requireOwned =
  (resource: OwnedResource, param = 'id') =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!(await isOwned(req, resource, req.params[param]))) return notFound(res);
      next();
    } catch (err) {
      next(err);
    }
  };

/** Route-level middleware: if req.body[field] is present it must be owned (404 otherwise). */
export const requireOwnedBody =
  (resource: OwnedResource, field: string) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const v = req.body?.[field];
      if (v !== undefined && v !== null && v !== '' && !(await isOwned(req, resource, v))) return notFound(res);
      next();
    } catch (err) {
      next(err);
    }
  };
