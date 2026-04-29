import { Request, Response, NextFunction } from 'express';
import { languageService } from '../services/languageService';
import { CreateLanguageDto, UpdateLanguageDto } from '../types';

export const languageController = {
  async getAll(req: Request, res: Response, next: NextFunction) {
    try {
      const languages = await languageService.getAll();
      res.json(languages);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const language = await languageService.getById(req.params.id);
      res.json(language);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data: CreateLanguageDto = req.body;
      const language = await languageService.create(data);
      res.status(201).json(language);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data: UpdateLanguageDto = req.body;
      const language = await languageService.update(req.params.id, data);
      res.json(language);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await languageService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
