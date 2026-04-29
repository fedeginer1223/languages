import { Request, Response, NextFunction } from 'express';
import { srsService } from '../services/srsService';

export const srsController = {
  async getDailySession(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await srsService.getDailySession(req.params.languageId);
      res.json(session);
    } catch (error) {
      next(error);
    }
  },

  async advanceWord(req: Request, res: Response, next: NextFunction) {
    try {
      const word = await srsService.advanceWord(req.params.wordId);
      res.json(word);
    } catch (error) {
      next(error);
    }
  },

  async resetWord(req: Request, res: Response, next: NextFunction) {
    try {
      const word = await srsService.resetWord(req.params.wordId);
      res.json(word);
    } catch (error) {
      next(error);
    }
  },

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await srsService.getStats(req.params.languageId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
};
