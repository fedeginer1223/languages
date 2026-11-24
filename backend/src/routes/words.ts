import { Router } from 'express';
import { wordController } from '../controllers/wordController';
import { ownedParam, requireOwnedBody } from '../middleware/ownership';

export const wordRouter = Router();

wordRouter.param('id', ownedParam('word'));

wordRouter.get('/:id', wordController.getById);
wordRouter.put('/:id', requireOwnedBody('topic', 'topicId'), wordController.update);
wordRouter.delete('/:id', wordController.delete);
