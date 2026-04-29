import { Router } from 'express';
import { topicController } from '../controllers/topicController';
import { wordController } from '../controllers/wordController';

export const topicRouter = Router();

topicRouter.get('/:id', topicController.getById);
topicRouter.put('/:id', topicController.update);
topicRouter.delete('/:id', topicController.delete);

// Words for a topic
topicRouter.get('/:topicId/words', wordController.getByTopicId);
topicRouter.post('/:topicId/words', wordController.create);
topicRouter.post('/:topicId/words/batch', wordController.createBatch);
