import { Router } from 'express';
import { topicController } from '../controllers/topicController';
import { wordController } from '../controllers/wordController';
import { ownedParam, requireOwnedBody } from '../middleware/ownership';

export const topicRouter = Router();

topicRouter.param('id', ownedParam('topic'));
topicRouter.param('topicId', ownedParam('topic'));

topicRouter.get('/:id', topicController.getById);
topicRouter.put('/:id', requireOwnedBody('language', 'languageId'), topicController.update);
topicRouter.delete('/:id', topicController.delete);

// Words for a topic
topicRouter.get('/:topicId/words', wordController.getByTopicId);
topicRouter.post('/:topicId/words', wordController.create);
topicRouter.post('/:topicId/words/batch', wordController.createBatch);
