import { Router } from 'express';
import { ttsService, defaultVoiceFor, TtsVoice } from '../services/ttsService';

const VALID_VOICES: TtsVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

export const ttsRouter = Router();

/**
 * GET /api/v1/tts?text=bonjour&lang=fr&voice=nova
 * Returns audio/mpeg (MP3). Cached on disk by (text, voice, model).
 */
ttsRouter.get('/tts', async (req, res, next) => {
  try {
    const text = String(req.query.text ?? '');
    const lang = String(req.query.lang ?? '');
    const requested = String(req.query.voice ?? '') as TtsVoice;
    const voice: TtsVoice = VALID_VOICES.includes(requested) ? requested : defaultVoiceFor(lang);

    if (!text.trim()) {
      res.status(400).json({ error: 'text required' });
      return;
    }

    const audio = await ttsService.synthesize(text, voice, lang);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(audio);
  } catch (err) {
    next(err);
  }
});
