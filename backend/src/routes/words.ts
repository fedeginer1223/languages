import { Router } from 'express';
import { wordController } from '../controllers/wordController';

export const wordRouter = Router();

wordRouter.get('/:id', wordController.getById);
wordRouter.put('/:id', wordController.update);
wordRouter.delete('/:id', wordController.delete);
