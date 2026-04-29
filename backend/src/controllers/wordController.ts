import { Request, Response, NextFunction } from 'express';
import { wordService } from '../services/wordService';
import { CreateWordDto, CreateWordsBatchDto } from '../types';

export const wordController = {
  async getByTopicId(req: Request, res: Response, next: NextFunction) {
    try {
      const sortBy = (req.query.sortBy as any) || 'learning';
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      const words = await wordService.getByTopicId(
        req.params.topicId,
        sortBy,
        limit,
        offset
      );
      res.json(words);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const word = await wordService.getById(req.params.id);
      res.json(word);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data: CreateWordDto = req.body;
      const word = await wordService.create(req.params.topicId, data);
      res.status(201).json(word);
    } catch (error) {
      next(error);
    }
  },

  async createBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const data: CreateWordsBatchDto = req.body;
      const result = await wordService.createBatch(req.params.topicId, data);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data: Partial<CreateWordDto> = req.body;
      const word = await wordService.update(req.params.id, data);
      res.json(word);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await wordService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
