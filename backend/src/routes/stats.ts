import { Router } from 'express';
import { statsController } from '../controllers/statsController';

export const statsRouter = Router();

statsRouter.get('/languages/:languageId', statsController.getLanguageStats);
statsRouter.get('/errors', statsController.getErrorStats);
