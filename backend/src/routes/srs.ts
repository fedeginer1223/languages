import { Router } from 'express';
import { srsController } from '../controllers/srsController';

export const srsRouter = Router();

// Global SRS (per language)
srsRouter.get('/:languageId/daily', srsController.getDailyGlobal);
srsRouter.post('/:languageId/mark-reviewed', srsController.markDueReviewed);
srsRouter.post('/:languageId/extra', srsController.addExtraWords);
srsRouter.post('/words/:wordId/advance', srsController.advanceWord);
srsRouter.post('/words/:wordId/reset', srsController.resetWord);
srsRouter.post('/words/:wordId/record-attempt', srsController.recordAttempt);
