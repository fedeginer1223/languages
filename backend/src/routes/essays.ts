import { Router } from 'express';
import { essayController } from '../controllers/essayController';
import { ownedParam, requireOwned, requireOwnedBody } from '../middleware/ownership';

export const essayRouter = Router();

essayRouter.param('id', ownedParam('essay'));

essayRouter.get('/:id', essayController.getById);
essayRouter.put('/:id', essayController.updateManual);
essayRouter.delete('/:id', essayController.delete);
essayRouter.post('/:id/errors/:errorId/convert', requireOwned('error', 'errorId'), requireOwnedBody('topic', 'topicId'), essayController.convertErrorToWord);
essayRouter.post('/errors/:errorId/validate', requireOwned('error', 'errorId'), essayController.validateErrorAnswer);
