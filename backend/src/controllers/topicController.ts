import { Request, Response, NextFunction } from 'express';
import { topicService } from '../services/topicService';
import { CreateTopicDto } from '../types';

export const topicController = {
  async getByLanguageId(req: Request, res: Response, next: NextFunction) {
    try {
      const topics = await topicService.getByLanguageId(req.params.languageId);
      res.json(topics);
    } catch (error) {
      next(error);
    }
  },

  async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const topic = await topicService.getById(req.params.id);
      res.json(topic);
    } catch (error) {
      next(error);
    }
  },

  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const data: CreateTopicDto = req.body;
      const topic = await topicService.create(req.params.languageId, data);
      res.status(201).json(topic);
    } catch (error) {
      next(error);
    }
  },

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const data: Partial<CreateTopicDto> = req.body;
      const topic = await topicService.update(req.params.id, data);
      res.json(topic);
    } catch (error) {
      next(error);
    }
  },

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      await topicService.delete(req.params.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
};
