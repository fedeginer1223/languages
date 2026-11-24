import { Router } from 'express';
import { languageController } from '../controllers/languageController';
import { topicController } from '../controllers/topicController';
import { verbController } from '../controllers/verbController';
import { essayController } from '../controllers/essayController';
import { wordController } from '../controllers/wordController';
import { ownedParam } from '../middleware/ownership';

export const languageRouter = Router();

languageRouter.param('id', ownedParam('language'));
languageRouter.param('languageId', ownedParam('language'));

languageRouter.get('/', languageController.getAll);
languageRouter.post('/', languageController.create);
languageRouter.get('/:id', languageController.getById);
languageRouter.put('/:id', languageController.update);
languageRouter.delete('/:id', languageController.delete);
languageRouter.get('/:id/due-counts', languageController.getDueCounts);
languageRouter.get('/:id/srs/backlog', languageController.getSrsBacklog);

languageRouter.get('/:languageId/today', languageController.getToday);

// Topics for a language
languageRouter.get('/:languageId/topics', topicController.getByLanguageId);
languageRouter.post('/:languageId/topics', topicController.create);

// Bulk vocabulary import (topic resolved by name; created if missing)
languageRouter.post('/:languageId/vocab/import', wordController.importForLanguage);

// Verbs for a language
languageRouter.get('/:languageId/verbs', verbController.getByLanguageId);
languageRouter.post('/:languageId/verbs', verbController.create);
languageRouter.get('/:languageId/verbs/srs/daily', verbController.getSrsDaily);

// Essays for a language
languageRouter.get('/:languageId/essays', essayController.getByLanguageId);
languageRouter.post('/:languageId/essays', essayController.create);
languageRouter.post('/:languageId/essays/manual', essayController.createManual);
languageRouter.get('/:languageId/essays/errors', essayController.getErrorWords);
languageRouter.get('/:languageId/essays/errors/training', essayController.getErrorsForTraining);
