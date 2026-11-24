import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import { languageRouter } from './routes/languages';
import { topicRouter } from './routes/topics';
import { wordRouter } from './routes/words';
import { verbRouter } from './routes/verbs';
import { essayRouter } from './routes/essays';
import { srsRouter } from './routes/srs';
import { structureRouter } from './routes/structures';
import { grammarRouter } from './routes/grammar';
import { bookRouter } from './routes/books';
import { authRouter } from './routes/auth';
import { extRouter } from './routes/ext';
import { requireApiKey } from './middleware/apiKey';
import { protectApi } from './middleware/auth';
import { assertAuthConfig } from './services/authService';
import { errorHandler } from './middleware/errorHandler';

dotenv.config();
assertAuthConfig();

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors());
app.set('trust proxy', 1); // Railway runs behind a proxy
app.use(express.json());
app.use(cookieParser());

// Auth: every /api/ path requires a session except /api/v1/auth/* and /api/v1/ext/*
// (/ext is the external API, protected by EXTERNAL_API_KEY instead).
app.use('/api/v1/auth', authRouter);
app.use(protectApi);

// Routes (all mounted after the auth middleware)
app.use('/api/v1/ext', requireApiKey, extRouter); // public to the session check, protected by EXTERNAL_API_KEY
app.use('/api/v1/languages', languageRouter);
app.use('/api/v1/topics', topicRouter);
app.use('/api/v1/words', wordRouter);
app.use('/api/v1/verbs', verbRouter);
app.use('/api/v1/essays', essayRouter);
app.use('/api/v1/srs', srsRouter);
app.use('/api/v1', structureRouter);
app.use('/api/v1', grammarRouter);
app.use('/api/v1', bookRouter);

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
