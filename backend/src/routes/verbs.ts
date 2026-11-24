import { Router } from 'express';
import { requireOwned } from '../middleware/ownership';
import { verbController } from '../controllers/verbController';

export const verbRouter = Router();

verbRouter.get('/search', verbController.searchVerbs);
verbRouter.get('/:id', requireOwned('verb'), verbController.getById);
verbRouter.put('/:id', requireOwned('verb'), verbController.update);
verbRouter.delete('/:id', requireOwned('verb'), verbController.delete);
verbRouter.post('/conjugations/:id/srs-validate', requireOwned('conjugation'), verbController.srsValidate);
verbRouter.post('/conjugations/:id/srs-advance', requireOwned('conjugation'), verbController.srsAdvance);
