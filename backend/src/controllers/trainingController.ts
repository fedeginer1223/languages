import { Request, Response, NextFunction } from 'express';
import { trainingService } from '../services/trainingService';
import { TrainingSessionParams, ValidateAnswerDto } from '../types';

export const trainingController = {
  async listSessions(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.query.languageId as string;
      if (!languageId) {
        return res.status(400).json({ error: 'languageId is required' });
      }
      const sessions = await trainingService.listSessions(languageId);
      res.json(sessions);
    } catch (error) {
      next(error);
    }
  },

  async renameSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const { name } = req.body;
      await trainingService.renameSession(sessionId, name);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async deleteSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      await trainingService.deleteSession(sessionId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async createSession(req: Request, res: Response, next: NextFunction) {
    try {
      const params: TrainingSessionParams = {
        mode: (req.query.mode as string) || 'by-level',
        trainingType: (req.query.trainingType as any) || 'batch',
        topicId: req.query.topicId as string,
        topicIds: req.query.topicIds as string,
        languageId: req.query.languageId as string,
        limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
        minErrorRate: req.query.minErrorRate ? parseFloat(req.query.minErrorRate as string) : undefined,
      };

      const session = await trainingService.createSession(params);
      res.json(session);
    } catch (error) {
      next(error);
    }
  },

  async validateAnswer(req: Request, res: Response, next: NextFunction) {
    try {
      const data: ValidateAnswerDto = req.body;
      const result = await trainingService.validateAnswer(data);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getMultipleChoiceOptions(req: Request, res: Response, next: NextFunction) {
    try {
      const { wordId } = req.params;
      const options = await trainingService.generateMultipleChoiceOptions(wordId);
      res.json(options);
    } catch (error) {
      next(error);
    }
  },

  async getSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const session = await trainingService.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      res.json(session);
    } catch (error) {
      next(error);
    }
  },

  async updateSessionProgress(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      const { currentIndex } = req.body;
      await trainingService.updateSessionProgress(sessionId, currentIndex);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async endSession(req: Request, res: Response, next: NextFunction) {
    try {
      const { sessionId } = req.params;
      await trainingService.endSession(sessionId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
