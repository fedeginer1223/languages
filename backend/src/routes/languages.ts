import { Router } from 'express';
import { languageController } from '../controllers/languageController';
import { topicController } from '../controllers/topicController';
import { verbController } from '../controllers/verbController';
import { essayController } from '../controllers/essayController';

export const languageRouter = Router();

languageRouter.get('/', languageController.getAll);
languageRouter.post('/', languageController.create);
languageRouter.get('/:id', languageController.getById);
languageRouter.put('/:id', languageController.update);
languageRouter.delete('/:id', languageController.delete);

// Topics for a language
languageRouter.get('/:languageId/topics', topicController.getByLanguageId);
languageRouter.post('/:languageId/topics', topicController.create);

// Verbs for a language
languageRouter.get('/:languageId/verbs', verbController.getByLanguageId);
languageRouter.post('/:languageId/verbs', verbController.create);

// Essays for a language
languageRouter.get('/:languageId/essays', essayController.getByLanguageId);
languageRouter.post('/:languageId/essays', essayController.create);
languageRouter.post('/:languageId/essays/manual', essayController.createManual);
languageRouter.get('/:languageId/essays/errors', essayController.getErrorWords);
languageRouter.get('/:languageId/essays/errors/training', essayController.getErrorsForTraining);
