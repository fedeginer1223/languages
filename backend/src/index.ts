import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { languageRouter } from './routes/languages';
import { topicRouter } from './routes/topics';
import { wordRouter } from './routes/words';
import { trainingRouter } from './routes/training';
import { verbRouter } from './routes/verbs';
import { essayRouter } from './routes/essays';
import { statsRouter } from './routes/stats';
import { srsRouter } from './routes/srs';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/v1/languages', languageRouter);
app.use('/api/v1/topics', topicRouter);
app.use('/api/v1/words', wordRouter);
app.use('/api/v1/training', trainingRouter);
app.use('/api/v1/verbs', verbRouter);
app.use('/api/v1/essays', essayRouter);
app.use('/api/v1/stats', statsRouter);
app.use('/api/v1/srs', srsRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend static files in production
const frontendPath = path.join(__dirname, '../../frontend/dist');
app.use(express.static(frontendPath));

// All non-API routes serve the frontend (SPA)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Error handling middleware
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
