export interface CreateLanguageDto {
  name: string;
  code: string;
}

export interface UpdateLanguageDto {
  name?: string;
  code?: string;
}

export interface CreateTopicDto {
  name: string;
  description?: string;
}

export interface CreateWordDto {
  term: string;
  definition: string;
}

export interface CreateWordsBatchDto {
  words: CreateWordDto[];
}

export interface TrainingSessionParams {
  mode: 'by-level' | 'by-topic';
  trainingType?: 'batch' | 'srs';
  topicId?: string;
  topicIds?: string; // comma-separated
  languageId?: string;
  limit?: number;
  minErrorRate?: number; // 0-100, words with successRate <= (100 - minErrorRate) or untrained
  source?: 'all' | 'vocabulary' | 'error';
  errorCategory?: string;
}

export interface ValidateAnswerDto {
  sessionId: string;
  wordId: string;
  answer: string;
}

export interface CreateVerbDto {
  infinitive: string;
  tenses: string[];
  conjugations?: {
    tense: string;
    person: string;
    form: string;
  }[];
}

export interface CreateEssayDto {
  title?: string;
  text: string;
}

export type ErrorType = 'accent' | 'grammar' | 'spelling' | 'other';

export interface CorrectionResult {
  correctedText: string;
  feedback?: string;
  errors: {
    errorType: ErrorType;
    original: string;
    corrected: string;
    explanation?: string;
    position?: number;
  }[];
}
