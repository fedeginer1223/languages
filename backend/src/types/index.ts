export interface CreateLanguageDto {
  name: string;
  code: string;
}

export interface UpdateLanguageDto {
  name?: string;
  code?: string;
  forgetDays?: number;
  sections?: string;
  structureVariantsRequired?: number;
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
  type?: string;
  grammarItemIds?: string[];
}

export interface GrammarVerdict {
  grammarItemId: string;
  used: boolean;
  correct: boolean;
  snippet?: string;
  note?: string;
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
  grammarVerdicts?: GrammarVerdict[];
}

// ─── "Hoy" landing summary ────────────────────────────────────────────
export interface TodayModuleStats {
  dueToday: number;
  overdue: number;
  newAvailable: number;
  reviewsInSession: number;
  newInSession: number;
  remainingReviews: number;
  tomorrow: number;
  mastered: number;
  inProgress: number;
  total: number;
}

export interface TodayResponse {
  date: string;
  sessionSize: number;
  modules: {
    vocabulary: TodayModuleStats;
    structures: TodayModuleStats;
    verbs: {
      verbsDue: number;
      verbsNeverTrained: number;
      conjugationsDue: number;
      tomorrowVerbs: number;
      totalVerbs: number;
    };
  };
  streak: { days: number; trainedToday: boolean; lastTrainedAt: string | null };
  week: Record<string, { vocabulary: number; structures: number }>;
}
