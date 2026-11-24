import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../utils/prisma';
import { wordService, normalizeTerm } from '../services/wordService';
import { structureService } from '../services/structureService';

export const extRouter = Router();

const DEFAULT_TOPIC = 'Vocabulario General';

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** Owner of the data exposed by the external API: EXTERNAL_API_USER_EMAIL, or the oldest user. */
async function resolveOwnerId(): Promise<string | null> {
  const email = process.env.EXTERNAL_API_USER_EMAIL?.trim();
  const user = email
    ? await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
    : await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  return user?.id ?? null;
}

async function findLanguage(code: string) {
  const userId = await resolveOwnerId();
  if (!userId) return null;
  return prisma.language.findFirst({
    where: { userId, code: { equals: code.trim(), mode: 'insensitive' } },
  });
}

extRouter.get(
  '/languages',
  wrap(async (_req, res) => {
    const userId = await resolveOwnerId();
    if (!userId) return res.json([]);
    const langs = await prisma.language.findMany({
      where: { userId },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
    res.json(langs);
  })
);

extRouter.get(
  '/topics',
  wrap(async (req, res) => {
    const code = typeof req.query.language === 'string' ? req.query.language : '';
    const lang = code ? await findLanguage(code) : null;
    if (!lang) return res.status(404).json({ error: 'language_not_found' });
    const topics = await prisma.topic.findMany({
      where: { languageId: lang.id },
      select: { id: true, name: true, _count: { select: { words: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(topics.map((t) => ({ id: t.id, name: t.name, wordCount: t._count.words })));
  })
);

const text200 = z.string().trim().min(1).max(200);
const wordsBody = z.object({
  language: z.string().trim().min(1),
  topic: z.string().trim().min(1).max(200).optional(),
  words: z.array(z.object({ term: text200, definition: text200 })).min(1).max(200),
});

extRouter.post(
  '/words',
  wrap(async (req, res) => {
    const body = wordsBody.parse(req.body);
    const lang = await findLanguage(body.language);
    if (!lang) return res.status(404).json({ error: 'language_not_found' });
    const result = await wordService.importForLanguage(
      lang.id,
      { topicName: body.topic ?? DEFAULT_TOPIC, words: body.words as { term: string; definition: string }[] },
      { languageWide: true }
    );
    res.locals.extCreated = result.inserted;
    res.json({
      created: result.inserted,
      duplicates: result.duplicates,
      topic: { id: result.topicId, name: result.topicName },
    });
  })
);

extRouter.get(
  '/words/search',
  wrap(async (req, res) => {
    const code = typeof req.query.language === 'string' ? req.query.language : '';
    const q = typeof req.query.q === 'string' ? normalizeTerm(req.query.q) : '';
    const lang = code ? await findLanguage(code) : null;
    if (!lang) return res.status(404).json({ error: 'language_not_found' });
    if (!q) return res.status(400).json({ error: 'q_required' });
    const words = await prisma.word.findMany({
      where: { topic: { languageId: lang.id } },
      select: { term: true, definition: true, srsLevel: true, topic: { select: { name: true } } },
    });
    const scored = words
      .map((w) => {
        const t = normalizeTerm(w.term);
        const d = normalizeTerm(w.definition);
        const rank = t === q ? 0 : t.startsWith(q) ? 1 : t.includes(q) ? 2 : d.includes(q) ? 3 : -1;
        return { w, rank };
      })
      .filter((x) => x.rank >= 0)
      .sort((a, b) => a.rank - b.rank || a.w.term.localeCompare(b.w.term))
      .slice(0, 20);
    res.json(
      scored.map(({ w }) => ({
        term: w.term,
        definition: w.definition,
        topic: w.topic.name,
        srsLevel: w.srsLevel,
      }))
    );
  })
);

const structuresBody = z.object({
  language: z.string().trim().min(1),
  structures: z
    .array(
      z.object({
        pattern: text200,
        category: z.string().trim().min(1).max(100).optional(),
        examples: z.array(z.object({ text: text200, spanish: text200.optional() })).max(30).optional(),
      })
    )
    .min(1)
    .max(100),
});

extRouter.post(
  '/structures',
  wrap(async (req, res) => {
    const body = structuresBody.parse(req.body);
    const lang = await findLanguage(body.language);
    if (!lang) return res.status(404).json({ error: 'language_not_found' });
    const existing = await prisma.structure.findMany({
      where: { languageId: lang.id },
      select: { pattern: true },
    });
    const seen = new Set(existing.map((s) => s.pattern));
    let created = 0;
    const duplicates: { pattern: string }[] = [];
    for (const s of body.structures) {
      if (seen.has(s.pattern)) {
        duplicates.push({ pattern: s.pattern });
        continue;
      }
      seen.add(s.pattern);
      const st = await structureService.create(lang.id, {
        pattern: s.pattern,
        category: s.category ?? 'general',
        examples: [],
      });
      if (s.examples && s.examples.length > 0) {
        await structureService.replaceExamples(st.id, s.examples as { text: string; spanish?: string }[]);
      }
      created++;
    }
    res.locals.extCreated = created;
    res.json({ created, duplicates });
  })
);
