import { Router } from 'express';
import { grammarController } from '../controllers/grammarController';

export const grammarRouter = Router();

grammarRouter.get('/languages/:languageId/grammar', grammarController.list);
grammarRouter.post('/languages/:languageId/grammar/extract', grammarController.importMarkdown);
grammarRouter.put('/languages/:languageId/grammar', grammarController.saveImported);
grammarRouter.get('/languages/:languageId/grammar/pick', grammarController.pick);
grammarRouter.put('/grammar/:id', grammarController.update);
grammarRouter.delete('/grammar/:id', grammarController.delete);
