export interface Language {
  id: string;
  name: string;
  code: string;
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
  createdAt: string;
  updatedAt: string;
}

export interface Essay {
  id: string;
  title?: string;
  originalText: string;
  languageId: string;
  corrections: EssayCorrection[];
  createdAt: string;
  updatedAt: string;
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

export interface TrainingSession {
  sessionId: string;
  mode: 'by-level' | 'by-topic';
  totalQuestions: number;
  questions: TrainingQuestion[];
}

export interface TrainingQuestion {
  id: string;
  wordId: string;
  definition: string;
  order: number;
  type: 'multiple_choice' | 'written';
  source: 'vocabulary' | 'error';
  answered?: boolean;
  correct?: boolean;
}

export interface ValidationResult {
  correct: boolean;
  expectedAnswer: string;
  explanation?: string;
  stats: {
    attempts: number;
    correctCount: number;
    successRate: number;
  };
}

export interface Stats {
  languageId: string;
  topicsCount: number;
  wordsCount: number;
  verbsCount: number;
  essaysCount: number;
  avgSuccessRate: number;
  mostDifficultWords: {
    id: string;
    term: string;
    successRate: number;
    attempts: number;
  }[];
  recentActivity: {
    last7Days: {
      attempts: number;
      correctCount: number;
      successRate: number;
    };
  };
}

export interface ErrorStats {
  totalErrors: number;
  byType: Record<string, number>;
  mostCommonErrors: {
    original: string;
    corrected: string;
    occurrences: number;
  }[];
}
