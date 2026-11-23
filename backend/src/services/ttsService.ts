import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(__dirname, '../../tts-cache');
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

export type TtsVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/** Reasonable defaults per language. */
export function defaultVoiceFor(langCode: string): TtsVoice {
  const c = (langCode || '').toLowerCase().slice(0, 2);
  switch (c) {
    case 'fr': return 'nova';
    case 'es': return 'shimmer';
    case 'en': return 'alloy';
    case 'it': return 'nova';
    case 'de': return 'onyx';
    case 'pt': return 'shimmer';
    default:   return 'nova';
  }
}

/** Human-readable language name for the model's instruction prompt. */
function languageNameFor(langCode: string): string {
  const c = (langCode || '').toLowerCase().slice(0, 2);
  switch (c) {
    case 'fr': return 'French';
    case 'es': return 'Spanish';
    case 'en': return 'English';
    case 'it': return 'Italian';
    case 'de': return 'German';
    case 'pt': return 'Portuguese';
    default:   return 'the target language';
  }
}

/** Language-specific pronunciation instructions. Focuses on the phonetic
 *  traps a Spanish-speaking learner most needs to hear correctly. */
function instructionsFor(langCode: string): string {
  const c = (langCode || '').toLowerCase().slice(0, 2);
  const base = `You are a native speaker of ${languageNameFor(langCode)} from ${
    { fr: 'Paris, France', es: 'Madrid, Spain', en: 'the United States', it: 'Rome, Italy', de: 'Berlin, Germany', pt: 'Lisbon, Portugal' }[c] || 'the target region'
  }. Speak the input as native ${languageNameFor(langCode)} with a perfectly natural accent, no foreign influence. Enunciate clearly at a slightly slow pace suitable for a language learner.`;

  switch (c) {
    case 'fr':
      return `${base} Follow standard Parisian French pronunciation strictly: nasal vowels (an/en/in/on/un), the uvular French R, silent final consonants, liaison between words where required, and the correct realisation of é/è/ê. The input is French — never read it with an English or Spanish accent.`;
    case 'en':
      return `${base} Use standard General American pronunciation. Never read the input with a French or Spanish accent — it is English.`;
    case 'es':
      return `${base} Use standard neutral Castilian Spanish (Spain), with distinción for c/z (/θ/) and clear pronunciation of all syllables. Never anglicize the input.`;
    case 'it':
      return `${base} Use standard Italian pronunciation (Tuscan / RAI standard). Double consonants must be geminated. Never anglicize.`;
    case 'de':
      return `${base} Use standard Hochdeutsch pronunciation. Umlauts (ä/ö/ü) and the ch sound must be crisp. Never anglicize.`;
    case 'pt':
      return `${base} Use standard European Portuguese from Lisbon. Reduce unstressed vowels appropriately. Never read as Spanish or English.`;
    default:
      return base;
  }
}

/** Cache key MUST include the language and the model — the same text in two
 *  languages (e.g. "menu" fr vs en) needs different audio. */
function cacheKey(text: string, voice: TtsVoice, model: string, langCode: string): string {
  return crypto.createHash('sha1').update(`${model}|${voice}|${langCode}|${text}`).digest('hex');
}

export const ttsService = {
  /** Synthesize `text` in `voice` for the given language, returning MP3 bytes.
   *  Uses gpt-4o-mini-tts with per-language pronunciation instructions so the
   *  accent is genuinely native (French text → French accent, not an English
   *  voice reading French letter-by-letter). Cached on disk by (model, voice,
   *  lang, text). */
  async synthesize(
    text: string,
    voice: TtsVoice = 'nova',
    langCode: string = 'fr',
    model: 'gpt-4o-mini-tts' | 'tts-1' | 'tts-1-hd' = 'gpt-4o-mini-tts',
  ): Promise<Buffer> {
    const trimmed = text.trim();
    if (!trimmed) throw new Error('empty text');
    if (trimmed.length > 500) throw new Error('text too long (>500 chars)');

    const key = cacheKey(trimmed, voice, model, langCode);
    const cachePath = path.join(CACHE_DIR, `${key}.mp3`);
    if (fs.existsSync(cachePath)) {
      return fs.promises.readFile(cachePath);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

    // gpt-4o-mini-tts accepts an `instructions` field that steers the accent
    // and pace. The older tts-1 models ignore it.
    const body: Record<string, any> = {
      model,
      voice,
      input: trimmed,
      response_format: 'mp3',
      speed: 0.9,
    };
    if (model === 'gpt-4o-mini-tts') {
      body.instructions = instructionsFor(langCode);
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`OpenAI TTS ${res.status}: ${errText.slice(0, 200)}`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buf = Buffer.from(arrayBuf);
    fs.promises.writeFile(cachePath, buf).catch((e) => console.error('tts cache write failed', e));
    return buf;
  },
};
