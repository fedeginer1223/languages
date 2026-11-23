import { Router } from 'express';
import { structureController } from '../controllers/structureController';

export const structureRouter = Router();

// CRUD scoped by language
structureRouter.get('/languages/:languageId/structures', structureController.list);
structureRouter.post('/languages/:languageId/structures', structureController.create);

// Daily SRS session
structureRouter.get('/languages/:languageId/structures/daily', structureController.getDailySession);

// AI scaffold from a seed example
structureRouter.post('/languages/:languageId/structures/ai-scaffold', structureController.aiScaffold);

// Per-structure operations
structureRouter.get('/structures/:id', structureController.getById);
structureRouter.put('/structures/:id', structureController.update);
structureRouter.delete('/structures/:id', structureController.delete);

// AI integration
structureRouter.post('/structures/:id/cue', structureController.generateCue);
structureRouter.post('/structures/:id/judge', structureController.judge);
structureRouter.post('/structures/:id/suggest', structureController.suggest);
structureRouter.post('/structures/:id/advance-srs', structureController.advanceSrs);
structureRouter.post('/structures/:id/reschedule', structureController.reschedule);

// Translation examples (new format)
structureRouter.post('/structures/:id/examples/generate', structureController.generateExamples);
structureRouter.put('/structures/:id/examples', structureController.replaceExamples);
structureRouter.put('/structures/:id/example-count', structureController.setExampleCount);
structureRouter.post('/structures/examples/:exampleId/attempt', structureController.recordExampleAttempt);
