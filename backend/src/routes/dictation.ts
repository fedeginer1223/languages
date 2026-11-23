import { Router, Request, Response, NextFunction } from 'express';
import { dictationService } from '../services/dictationService';

export const dictationRouter = Router();

dictationRouter.get('/dictation/:languageId/daily', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const languageId = String(req.params.languageId);
    const topicIds = req.query.topicIds ? String(req.query.topicIds).split(',').filter(Boolean) : undefined;
    const newWordCount = req.query.newWordCount ? parseInt(String(req.query.newWordCount)) : undefined;
    const selectionMode = (req.query.selectionMode as 'fifo' | 'lifo' | 'random') || undefined;
    const characterFilter = req.query.characterFilter ? String(req.query.characterFilter) : undefined;
    const result = await dictationService.getDaily(languageId, topicIds, newWordCount, selectionMode, characterFilter);
    res.json(result);
  } catch (err) { next(err); }
});

dictationRouter.post('/dictation/words/:wordId/advance', async (req, res, next) => {
  try { res.json(await dictationService.advanceWord(req.params.wordId)); } catch (err) { next(err); }
});

dictationRouter.post('/dictation/words/:wordId/reset', async (req, res, next) => {
  try { res.json(await dictationService.resetWord(req.params.wordId)); } catch (err) { next(err); }
});

dictationRouter.post('/dictation/words/:wordId/record-attempt', async (req, res, next) => {
  try {
    const correct = req.body.correct === true;
    res.json(await dictationService.recordAttempt(req.params.wordId, correct));
  } catch (err) { next(err); }
});
