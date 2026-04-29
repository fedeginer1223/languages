import { Request, Response, NextFunction } from 'express';
import { statsService } from '../services/statsService';

export const statsController = {
  async getLanguageStats(req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await statsService.getLanguageStats(req.params.languageId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },

  async getErrorStats(req: Request, res: Response, next: NextFunction) {
    try {
      const languageId = req.query.languageId as string | undefined;
      const stats = await statsService.getErrorStats(languageId);
      res.json(stats);
    } catch (error) {
      next(error);
    }
  },
};
