import { Request, Response, NextFunction } from 'express';
import { srsService } from '../services/srsService';
import { parseSessionSize } from '../utils/sessionComposer';

export const srsController = {
  async markDueReviewed(req: Request, res: Response, next: NextFunction) {
    try {
      const mode = req.body?.mode;
      if (mode !== 'advance' && mode !== 'postpone') {
        return res.status(400).json({ error: "mode must be 'advance' or 'postpone'" });
      }
      const topicIds = Array.isArray(req.body?.topicIds) ? req.body.topicIds.map(String) : undefined;
      const dryRun = req.query.dryRun === 'true';
      const result = await srsService.markDueReviewed(String(req.params.languageId), mode, { topicIds, dryRun });
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getDailyGlobal(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.params.languageId;
      const topicIds = req.query.topicIds ? (req.query.topicIds as string).split(',') : undefined;
      const newWordCount = req.query.newWordCount ? parseInt(req.query.newWordCount as string) : undefined;
      const selectionMode = (req.query.selectionMode as 'fifo' | 'lifo' | 'random') || undefined;
      const errorsOnly = req.query.errorsOnly === 'true';
      const result = await srsService.getDailyGlobal(languageId, topicIds, newWordCount, selectionMode, errorsOnly, parseSessionSize(req.query.sessionSize));
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async advanceWord(req: Request, res: Response, next: NextFunction) {
    try {
      const word = await srsService.advanceWordGlobal(req.params.wordId);
      res.json(word);
    } catch (error) {
      next(error);
    }
  },

  async recordAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const correct = req.body.correct === true;
      const result = await srsService.recordAttempt(req.params.wordId, correct);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async resetWord(req: Request, res: Response, next: NextFunction) {
    try {
      const word = await srsService.resetWordGlobal(req.params.wordId);
      res.json(word);
    } catch (error) {
      next(error);
    }
  },

  async addExtraWords(req: Request, res: Response, next: NextFunction) {
    try {
      const count = parseInt(req.body.count) || 7;
      const languageId = req.params.languageId;
      const topicIds = req.body.topicIds ? (req.body.topicIds as string).split(',') : undefined;

      // Get extra new words from the language
      const topicFilter: any = { languageId, name: { not: 'Errores de redacción' } };
      if (topicIds && topicIds.length > 0) topicFilter.id = { in: topicIds };

      const { prisma } = await import('../utils/prisma');
      const extra = await prisma.word.findMany({
        where: { topic: topicFilter, source: 'vocabulary', srsLevel: 0, lastTrainedAt: null },
        take: count,
      });

      const words = extra.map(w => ({
        ...w,
        label: 'nueva' as const,
        daysSinceLastTrained: null,
      }));

      res.json(words);
    } catch (error) {
      next(error);
    }
  },

  async getMultipleChoiceOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const options = await srsService.generateMultipleChoiceOptions(req.params.wordId);
      res.json(options);
    } catch (error) {
      next(error);
    }
  },
};
