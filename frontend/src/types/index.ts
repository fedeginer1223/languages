export interface Language {
  id: string;
  name: string;
  code: string;
  forgetDays: number;
  sections: string;
  structureVariantsRequired: number;
  createdAt: string;
  stats?: {
    topicsCount: number;
    wordsCount: number;
    verbsCount: number;
    essaysCount: number;
    avgSuccessRate: number;
  };
}

export interface Topic {
  id: string;
  name: string;
  description?: string;
  languageId: string;
  wordsCount: number;
  avgSuccessRate: number;
  createdAt: string;
  updatedAt: string;
}

export interface Word {
  id: string;
  term: string;
  definition: string;
  topicId: string;
  source: 'vocabulary' | 'error';
  occurrences: number;
  srsLevel: number;
  lastTrainedAt: string | null;
  nextReviewAt: string | null;
  attempts: number;
  correctCount: number;
  successRate: number;
  weightedScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface Verb {
  id: string;
  infinitive: string;
  languageId: string;
  conjugations: VerbConjugation[];
  createdAt: string;
  updatedAt: string;
}

export interface VerbConjugation {
  id: string;
  verbId: string;
  tense: string;
  person: string;
  form: string;
  attempts: number;
  correctCount: number;
  successRate: number;
  srsLevel?: number;
  lastTrainedAt?: string | null;
  nextReviewAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Essay {
  id: string;
  title?: string;
  type?: string;
  originalText: string;
  languageId: string;
  corrections: EssayCorrection[];
  grammarRequests?: EssayGrammarRequest[];
  createdAt: string;
  updatedAt: string;
}

export interface GrammarItem {
  id: string;
  languageId: string;
  title: string;
  body: string;
  attempts: number;
  correctCount: number;
  successRate: number;
  recentResults: string;
  weightedScore: number;
  lastPracticedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EssayGrammarRequest {
  id: string;
  essayId: string;
  grammarItemId: string;
  used: boolean;
  correct: boolean;
  snippet?: string | null;
  note?: string | null;
  grammarItem?: GrammarItem;
  createdAt: string;
}

export interface EssayCorrection {
  id: string;
  essayId: string;
  correctedText: string;
  feedback?: string;
  errors: Error[];
  createdAt: string;
}

export interface Error {
  id: string;
  correctionId: string;
  errorType: 'accent' | 'grammar' | 'spelling' | 'other';
  original: string;
  corrected: string;
  explanation?: string;
  position?: number;
  attempts: number;
  correctCount: number;
  successRate: number;
  convertedToWord: boolean;
  wordId?: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields added to every daily-session summary by the session composer. */
export interface SessionComposition {
  sessionSize: number;
  reviewsInSession: number;
  newInSession: number;
  remainingReviews: number;
  remainingNew: number;
  tomorrowCount?: number;
}

export type TranslationVerdict = 'valid' | 'almost' | 'invalid';

export interface JudgeExampleResult {
  verdict: TranslationVerdict;
  corrected?: string;
  explanation: string;
  source: 'exact' | 'ai' | 'fallback';
}
