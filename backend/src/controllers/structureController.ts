import { parseSessionSize } from '../utils/sessionComposer';
import { Request, Response, NextFunction } from 'express';
import { structureService } from '../services/structureService';
import { structureSrsService } from '../services/structureSrsService';
import { structureAiService } from '../services/structureAiService';
import { prisma } from '../utils/prisma';

async function getLanguageName(languageId: string): Promise<string> {
  const lang = await prisma.language.findUnique({ where: { id: languageId }, select: { name: true } });
  return lang?.name ?? 'English';
}

export const structureController = {
  // CRUD
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await structureService.list(req.params.languageId);
      res.json(items);
    } catch (e) { next(e); }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await structureService.getById(req.params.id);
      if (!item) return res.status(404).json({ error: 'Not found' });
      res.json(item);
    } catch (e) { next(e); }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const { pattern, category, examples } = req.body;
      if (!pattern || !category) return res.status(400).json({ error: 'pattern and category are required' });
      const item = await structureService.create(req.params.languageId, {
        pattern,
        category,
        examples: Array.isArray(examples) ? examples : [],
      });
      res.status(201).json(item);
    } catch (e) { next(e); }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await structureService.update(req.params.id, req.body);
      res.json(item);
    } catch (e) { next(e); }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await structureService.delete(req.params.id);
      res.json({ ok: true });
    } catch (e) { next(e); }
  },

  // SRS / Training
  async getDailySession(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.params.languageId;
      const newCount = req.query.newCount ? parseInt(req.query.newCount as string) : undefined;
      const selectionMode = (req.query.selectionMode as 'fifo' | 'lifo' | 'random') || 'fifo';
      const result = await structureSrsService.getDaily(languageId, newCount, selectionMode, parseSessionSize(req.query.sessionSize));
      res.json(result);
    } catch (e) { next(e); }
  },

  async generateCue(req: Request, res: Response, next: NextFunction) {
    try {
      const structureId = req.params.id;
      const excludeCues = req.body.excludeCues as string[] | undefined;
      const structure = await prisma.structure.findUnique({ where: { id: structureId }, select: { languageId: true } });
      if (!structure) return res.status(404).json({ error: 'Structure not found' });
      const languageName = await getLanguageName(structure.languageId);
      const result = await structureSrsService.generateCue(structureId, languageName, excludeCues);
      res.json(result);
    } catch (e) { next(e); }
  },

  async judge(req: Request, res: Response, next: NextFunction) {
    try {
      const { cue, userResponse, responseTimeMs, recordMetric } = req.body;
      const structureId = req.params.id;
      const structure = await prisma.structure.findUnique({ where: { id: structureId }, select: { languageId: true } });
      if (!structure) return res.status(404).json({ error: 'Structure not found' });
      const languageName = await getLanguageName(structure.languageId);
      const result = await structureSrsService.judge({
        structureId,
        languageName,
        cue: cue ?? '',
        userResponse: userResponse ?? '',
        responseTimeMs: typeof responseTimeMs === 'number' ? responseTimeMs : 0,
        recordMetric: recordMetric !== false,
      });
      res.json(result);
    } catch (e) { next(e); }
  },

  async advanceSrs(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await structureSrsService.advanceSrs(req.params.id);
      res.json({ ok: true, newLevel: updated.srsLevel, nextReviewAt: updated.nextReviewAt });
    } catch (e) { next(e); }
  },

  async reschedule(req: Request, res: Response, next: NextFunction) {
    try {
      const updated = await structureSrsService.rescheduleSameLevel(req.params.id);
      res.json({ ok: true, srsLevel: updated.srsLevel, nextReviewAt: updated.nextReviewAt });
    } catch (e) { next(e); }
  },

  async suggest(req: Request, res: Response, next: NextFunction) {
    try {
      const structureId = req.params.id;
      const { cue } = req.body;
      if (!cue || typeof cue !== 'string' || !cue.trim()) {
        return res.status(400).json({ error: 'cue is required' });
      }
      const structure = await prisma.structure.findUnique({
        where: { id: structureId },
        include: { examples: { orderBy: { order: 'asc' } } },
      });
      if (!structure) return res.status(404).json({ error: 'Structure not found' });
      const languageName = await getLanguageName(structure.languageId);
      const result = await structureAiService.suggestForCue({
        languageName,
        pattern: structure.pattern,
        examples: structure.examples.map((e) => e.text),
        cue: cue.trim(),
      });
      res.json(result);
    } catch (e) { next(e); }
  },

  async setExampleCount(req: Request, res: Response, next: NextFunction) {
    try {
      const n = Number(req.body?.exampleCount);
      if (!Number.isFinite(n) || n < 1) return res.status(400).json({ error: 'exampleCount must be a positive number' });
      const updated = await structureService.setExampleCount(req.params.id, n);
      res.json({ ok: true, exampleCount: updated.exampleCount });
    } catch (e) { next(e); }
  },

  async generateExamples(req: Request, res: Response, next: NextFunction) {
    try {
      const structureId = req.params.id;
      const structure = await prisma.structure.findUnique({
        where: { id: structureId },
        include: { examples: { orderBy: { order: 'asc' } } },
      });
      if (!structure) return res.status(404).json({ error: 'Structure not found' });
      const requested = Number(req.body?.count);
      const count = Number.isFinite(requested) && requested > 0
        ? Math.min(30, Math.floor(requested))
        : structure.exampleCount;
      const languageName = await getLanguageName(structure.languageId);
      const excludeSpanish = Array.isArray(req.body?.excludeSpanish) ? req.body.excludeSpanish as string[] : undefined;
      const seedExamples = structure.examples.map((e) => e.text).filter((t) => t.length > 0);
      const examples = await structureAiService.generateExamples({
        languageName,
        pattern: structure.pattern,
        category: structure.category,
        count,
        seedExamples: seedExamples.length > 0 ? seedExamples : undefined,
        excludeSpanish,
      });
      res.json({ examples });
    } catch (e) { next(e); }
  },

  async replaceExamples(req: Request, res: Response, next: NextFunction) {
    try {
      const structureId = req.params.id;
      const body = req.body ?? {};
      const raw = Array.isArray(body.examples) ? body.examples : [];
      const examples = raw
        .map((e: any) => ({
          spanish: typeof e?.spanish === 'string' ? e.spanish : null,
          text: typeof e?.target === 'string' ? e.target : (typeof e?.text === 'string' ? e.text : ''),
        }))
        .filter((e: { text: string }) => e.text.trim().length > 0);
      // Update exampleCount to match confirmed length (unless caller passed one explicitly)
      const desiredCount = Number(body.exampleCount);
      if (Number.isFinite(desiredCount) && desiredCount > 0) {
        await structureService.setExampleCount(structureId, desiredCount);
      } else if (examples.length > 0) {
        await structureService.setExampleCount(structureId, examples.length);
      }
      const updated = await structureService.replaceExamples(structureId, examples);
      res.json(updated);
    } catch (e) { next(e); }
  },

  async judgeExample(req: Request, res: Response, next: NextFunction) {
    try {
      const { answer, responseTimeMs } = req.body ?? {};
      if (typeof answer !== 'string' || !answer.trim() || answer.length > 500) {
        return res.status(400).json({ error: 'answer must be a non-empty string of at most 500 characters' });
      }
      const example = await prisma.structureExample.findUnique({
        where: { id: req.params.exampleId },
        include: { structure: { include: { examples: { orderBy: { order: 'asc' } } } } },
      });
      if (!example) return res.status(404).json({ error: 'Example not found' });
      const languageName = await getLanguageName(example.structure.languageId);
      const otherExamples = example.structure.examples
        .filter((e) => e.id !== example.id)
        .map((e) => e.text)
        .filter((t) => t.trim().length > 0)
        .slice(0, 4);
      const result = await structureAiService.judgeTranslation({
        languageName,
        pattern: example.structure.pattern,
        spanish: example.spanish ?? '',
        reference: example.text,
        otherExamples,
        userResponse: answer.trim(),
      });
      try {
        await prisma.structureAttempt.create({
          data: {
            structureId: example.structureId,
            cue: example.spanish ?? '',
            userResponse: answer.trim(),
            verdict: result.verdict,
            suggestion: result.corrected ?? null,
            responseTimeMs: typeof responseTimeMs === 'number' && Number.isFinite(responseTimeMs) ? Math.max(0, Math.round(responseTimeMs)) : 0,
            withinLimit: true,
          },
        });
      } catch (logErr) {
        console.error('Failed to log structure attempt', logErr);
      }
      res.json(result);
    } catch (e) { next(e); }
  },

  async recordExampleAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const exampleId = req.params.exampleId;
      const correct = req.body?.correct === true;
      const updated = await structureService.recordExampleAttempt(exampleId, correct);
      res.json({
        id: updated.id,
        attempts: updated.attempts,
        correctCount: updated.correctCount,
        lastTrainedAt: updated.lastTrainedAt,
      });
    } catch (e) { next(e); }
  },

  async aiScaffold(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.params.languageId;
      const { seed, categories } = req.body;
      if (!seed || typeof seed !== 'string' || !seed.trim()) {
        return res.status(400).json({ error: 'seed is required' });
      }
      if (!Array.isArray(categories) || categories.length === 0) {
        return res.status(400).json({ error: 'categories list is required' });
      }
      const languageName = await getLanguageName(languageId);
      const result = await structureAiService.scaffoldFromExample({
        languageName,
        seed: seed.trim(),
        categories,
      });
      res.json(result);
    } catch (e) { next(e); }
  },
};
