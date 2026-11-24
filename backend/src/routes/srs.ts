import { Router } from 'express';
import { srsController } from '../controllers/srsController';
import { ownedParam } from '../middleware/ownership';

export const srsRouter = Router();

srsRouter.param('languageId', ownedParam('language'));
srsRouter.param('wordId', ownedParam('word'));

// Global SRS (per language)
srsRouter.get('/:languageId/daily', srsController.getDailyGlobal);
srsRouter.post('/:languageId/mark-reviewed', srsController.markDueReviewed);
srsRouter.post('/:languageId/extra', srsController.addExtraWords);
srsRouter.post('/words/:wordId/advance', srsController.advanceWord);
srsRouter.post('/words/:wordId/reset', srsController.resetWord);
srsRouter.post('/words/:wordId/record-attempt', srsController.recordAttempt);
srsRouter.get('/multiple-choice/:wordId', srsController.getMultipleChoiceOptions);
