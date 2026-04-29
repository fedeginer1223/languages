// French function words for classification
const PREPOSITIONS = new Set(['à', 'de', 'du', 'des', 'au', 'aux', 'en', 'dans', 'sur', 'sous', 'par', 'pour', 'avec', 'sans', 'chez', 'entre', 'vers', 'contre']);
const ARTICLES = new Set(['le', 'la', 'les', 'un', 'une', 'des', 'du', "l'", "d'", "l'", "d'"]);
const ACCENT_CHARS = /[àâäéèêëïîôùûüçœæ]/i;
const VERB_ENDINGS = /(?:ais|ait|aient|ions|iez|ons|ez|ent|é|ée|és|ées|ir|er|re|ant)$/i;

export type ErrorCategory = 'accent' | 'spelling' | 'vocabulary' | 'preposition' | 'conjugation' | 'expression' | 'article';

export interface DetectedError {
  redText: string;        // exactly what was in red
  fullWord: string;       // the full word/phrase to train
  category: ErrorCategory;
  context: string;        // surrounding words for reference
  start: number;          // position in plain text
  end: number;
}

interface RedSpan {
  text: string;
  start: number;
  end: number;
}

function isRedColor(color: string): boolean {
  if (!color) return false;
  const c = color.toLowerCase().trim();
  if (c === 'red' || c === '#ff0000' || c === '#f00') return true;
  const rgbMatch = c.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return r > 180 && g < 80 && b < 80;
  }
  const hexMatch = c.match(/^#([0-9a-f]{6})$/);
  if (hexMatch) {
    const r = parseInt(hexMatch[1].slice(0, 2), 16);
    const g = parseInt(hexMatch[1].slice(2, 4), 16);
    const b = parseInt(hexMatch[1].slice(4, 6), 16);
    return r > 180 && g < 80 && b < 80;
  }
  return false;
}

function getWordAt(text: string, start: number, end: number): { word: string; wordStart: number; wordEnd: number } {
  const wordBoundary = /[\s.,;:!?""«»()\[\]{}—–\-\/\\]/;

  // Expand left
  let wordStart = start;
  while (wordStart > 0 && !wordBoundary.test(text[wordStart - 1])) {
    wordStart--;
  }

  // Expand right
  let wordEnd = end;
  while (wordEnd < text.length && !wordBoundary.test(text[wordEnd])) {
    wordEnd++;
  }

  return { word: text.slice(wordStart, wordEnd), wordStart, wordEnd };
}

function getContext(text: string, start: number, end: number, windowSize: number = 3): string {
  // Get N words before and after
  const words = text.split(/\s+/);
  let charCount = 0;
  let startWordIdx = 0;
  let endWordIdx = words.length - 1;

  for (let i = 0; i < words.length; i++) {
    if (charCount + words[i].length >= start && startWordIdx === 0) {
      startWordIdx = i;
    }
    if (charCount >= end) {
      endWordIdx = i;
      break;
    }
    charCount += words[i].length + 1; // +1 for space
  }

  const from = Math.max(0, startWordIdx - windowSize);
  const to = Math.min(words.length, endWordIdx + windowSize + 1);
  return words.slice(from, to).join(' ');
}

function classify(redText: string, fullWord: string, wordBefore: string, wordAfter: string): { category: ErrorCategory; trainWord: string } {
  const redLower = redText.toLowerCase().trim();
  const isInsideWord = fullWord.toLowerCase() !== redLower;
  const hasMultipleWords = redText.trim().includes(' ');

  // 1. Expression (multiple words in red)
  if (hasMultipleWords) {
    return { category: 'expression', trainWord: redText.trim() };
  }

  // 2. Accent: 1-2 chars inside a word with accent characters
  if (isInsideWord && redText.length <= 2 && ACCENT_CHARS.test(redText)) {
    return { category: 'accent', trainWord: fullWord };
  }

  // 3. Spelling: short red text inside a word (not the whole word)
  if (isInsideWord && redText.length <= 3) {
    return { category: 'spelling', trainWord: fullWord };
  }

  // 4. Preposition: small word that follows a verb
  if (PREPOSITIONS.has(redLower)) {
    const trainPhrase = wordBefore ? `${wordBefore} ${redText.trim()}` : redText.trim();
    return { category: 'preposition', trainWord: trainPhrase };
  }

  // 5. Article
  if (ARTICLES.has(redLower)) {
    const trainPhrase = wordAfter ? `${redText.trim()} ${wordAfter}` : redText.trim();
    return { category: 'article', trainWord: trainPhrase };
  }

  // 6. Conjugation: matches verb ending patterns
  if (VERB_ENDINGS.test(redLower) && !isInsideWord) {
    return { category: 'conjugation', trainWord: redText.trim() };
  }

  // 7. Default: vocabulary
  return { category: 'vocabulary', trainWord: isInsideWord ? fullWord : redText.trim() };
}

export function extractErrorsFromHtml(html: string, plainText: string): DetectedError[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Step 1: Walk HTML tree, build text with offsets, record red spans
  const redSpans: RedSpan[] = [];
  let builtText = '';

  function walk(node: Node, parentIsRed: boolean) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (parentIsRed && text.trim()) {
        redSpans.push({ text, start: builtText.length, end: builtText.length + text.length });
      }
      builtText += text;
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const red = parentIsRed || isRedColor(el.style?.color || '');
      for (const child of Array.from(node.childNodes)) {
        walk(child, red);
      }
    }
  }

  walk(doc.body, false);

  // Step 2: Map red spans onto the plainText (which may differ slightly from builtText)
  // Use builtText as reference since that's what the HTML produces
  const textToUse = plainText || builtText;

  // Step 3: For each red span, find full word, context, classify
  const errors: DetectedError[] = [];

  for (const span of redSpans) {
    const redText = span.text.trim();
    if (!redText) continue;

    // Find this red text in the actual plain text (approximate position matching)
    let actualStart = span.start;
    let actualEnd = span.end;

    // Try to find exact match near the expected position
    const searchStart = Math.max(0, actualStart - 20);
    const searchEnd = Math.min(textToUse.length, actualEnd + 20);
    const searchRegion = textToUse.slice(searchStart, searchEnd);
    const idx = searchRegion.indexOf(redText);
    if (idx !== -1) {
      actualStart = searchStart + idx;
      actualEnd = actualStart + redText.length;
    }

    // Get full word
    const { word: fullWord } = getWordAt(textToUse, actualStart, actualEnd);

    // Get surrounding words for context and classification
    const beforeStart = Math.max(0, actualStart - 50);
    const textBefore = textToUse.slice(beforeStart, actualStart).trim();
    const wordBefore = textBefore.split(/\s+/).pop() || '';

    const afterEnd = Math.min(textToUse.length, actualEnd + 50);
    const textAfter = textToUse.slice(actualEnd, afterEnd).trim();
    const wordAfter = textAfter.split(/\s+/)[0] || '';

    const context = getContext(textToUse, actualStart, actualEnd);
    const { category, trainWord } = classify(redText, fullWord, wordBefore, wordAfter);

    errors.push({
      redText,
      fullWord: trainWord,
      category,
      context,
      start: actualStart,
      end: actualEnd,
    });
  }

  return errors;
}
