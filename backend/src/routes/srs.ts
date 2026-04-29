import { Router } from 'express';
import { srsController } from '../controllers/srsController';

export const srsRouter = Router();

srsRouter.get('/:languageId/daily', srsController.getDailySession);
srsRouter.get('/:languageId/stats', srsController.getStats);
srsRouter.post('/words/:wordId/advance', srsController.advanceWord);
srsRouter.post('/words/:wordId/reset', srsController.resetWord);
