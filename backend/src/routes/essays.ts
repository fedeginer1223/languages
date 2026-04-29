import { Router } from 'express';
import { essayController } from '../controllers/essayController';

export const essayRouter = Router();

essayRouter.get('/:id', essayController.getById);
essayRouter.put('/:id', essayController.updateManual);
essayRouter.delete('/:id', essayController.delete);
essayRouter.post('/:id/errors/:errorId/convert', essayController.convertErrorToWord);
essayRouter.post('/errors/:errorId/validate', essayController.validateErrorAnswer);
