import { Request, Response, NextFunction } from 'express';
import { verbService } from '../services/verbService';
import { CreateVerbDto } from '../types';

export const verbController = {
  async searchVerbs(req: Request, res: Response, next: NextFunction) {
    try {
      const query = req.query.q as string;
      const language = req.query.language as string || 'french';

      if (!query || query.length < 2) {
        return res.json([]);
      }

      const suggestions = await verbService.searchVerbs(query, language);
      res.json(suggestions);
    } catch (error) {
      next(error);
    }
  },

  async getByLanguageId(req: Request, res: Response, next: NextFunction) {
    try {
      const verbs = await verbService.getByLanguageId(req.params.languageId);
      res.json(verbs);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const verb = await verbService.getById(req.params.id);
      res.json(verb);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data: CreateVerbDto = req.body;
      const verb = await verbService.create(req.params.languageId, data);
      res.status(201).json(verb);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data: Partial<CreateVerbDto> = req.body;
      const verb = await verbService.update(req.params.id, data);
      res.json(verb);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await verbService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },

  async getPracticeQuestions(req: Request, res: Response, next: NextFunction) {
    try {
      const tenses = req.query.tenses
        ? (req.query.tenses as string).split(',')
        : undefined;
      const questions = await verbService.getPracticeQuestions(
        req.params.id,
        tenses
      );
      res.json(questions);
    } catch (error) {
      next(error);
    }
  },

  async validateConjugation(req: Request, res: Response, next: NextFunction) {
    try {
      const { answer } = req.body;
      const result = await verbService.validateConjugation(req.params.id, answer);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },
};
