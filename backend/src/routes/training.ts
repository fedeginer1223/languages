import { Router } from 'express';
import { trainingController } from '../controllers/trainingController';

export const trainingRouter = Router();

trainingRouter.get('/sessions', trainingController.listSessions);
trainingRouter.get('/session', trainingController.createSession);
trainingRouter.get('/session/:sessionId', trainingController.getSession);
trainingRouter.put('/session/:sessionId/progress', trainingController.updateSessionProgress);
trainingRouter.put('/session/:sessionId/name', trainingController.renameSession);
trainingRouter.post('/session/:sessionId/end', trainingController.endSession);
trainingRouter.delete('/session/:sessionId', trainingController.deleteSession);
trainingRouter.post('/validate', trainingController.validateAnswer);
trainingRouter.get('/multiple-choice/:wordId', trainingController.getMultipleChoiceOptions);
