import { Router } from 'express';
import { verbController } from '../controllers/verbController';

export const verbRouter = Router();

verbRouter.get('/search', verbController.searchVerbs);
verbRouter.get('/:id', verbController.getById);
verbRouter.put('/:id', verbController.update);
verbRouter.delete('/:id', verbController.delete);
verbRouter.get('/:id/practice', verbController.getPracticeQuestions);
verbRouter.post('/conjugations/:id/validate', verbController.validateConjugation);
