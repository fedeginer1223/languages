import { Request, Response, NextFunction } from 'express';
import { essayService } from '../services/essayService';
import { CreateEssayDto } from '../types';

export const essayController = {
  async getByLanguageId(req: Request, res: Response, next: NextFunction) {
    try {
      const essays = await essayService.getByLanguageId(req.params.languageId);
      res.json(essays);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const essay = await essayService.getById(req.params.id);
      res.json(essay);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data: CreateEssayDto = req.body;
      const essay = await essayService.create(req.params.languageId, data);
      res.status(201).json(essay);
    } catch (error) {
      next(error);
    }
  },

  async createManual(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, text, errors } = req.body;
      const essay = await essayService.createManual(req.params.languageId, { title, text, errors });
      res.status(201).json(essay);
    } catch (error) {
      next(error);
    }
  },

  async updateManual(req: Request, res: Response, next: NextFunction) {
    try {
      const { title, text, errors } = req.body;
      const essay = await essayService.updateManual(req.params.id, { title, text, errors });
      res.json(essay);
    } catch (error) {
      next(error);
    }
  },

  async getErrorsForTraining(req: Request, res: Response, next: NextFunction) {
    try {
      const categories = req.query.categories
        ? (req.query.categories as string).split(',')
        : undefined;
      const errors = await essayService.getErrorsForTraining(req.params.languageId, categories);
      res.json(errors);
    } catch (error) {
      next(error);
    }
  },

  async validateErrorAnswer(req: Request, res: Response, next: NextFunction) {
    try {
      const { answer } = req.body;
      const result = await essayService.validateErrorAnswer(req.params.errorId, answer);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async getErrorWords(req: Request, res: Response, next: NextFunction) {
    try {
      const words = await essayService.getErrorWords(req.params.languageId);
      res.json(words);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await essayService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async convertErrorToWord(req: Request, res: Response, next: NextFunction) {
    try {
      const { topicId } = req.body;
      const word = await essayService.convertErrorToWord(
        req.params.errorId,
        topicId
      );
      res.status(201).json({ word });
    } catch (error) {
      next(error);
    }
  },
};
