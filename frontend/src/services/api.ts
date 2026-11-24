import axios from 'axios';
import type {
  Language,
  Topic,
  Word,
  Verb,
  Essay,
  JudgeExampleResult,
} from '../types';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const url: string = error?.config?.url ?? '';
    if (error?.response?.status === 401 && !url.startsWith('/auth/')) {
      window.dispatchEvent(new Event('ll:unauthorized'));
    }
    return Promise.reject(error);
  },
);

export interface AuthUser {
  id: string;
  email: string;
}

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ user: AuthUser }>('/auth/login', { email, password }).then((res) => res.data.user),
  logout: () => api.post('/auth/logout').then((res) => res.data),
  me: () => api.get<{ user: AuthUser }>('/auth/me').then((res) => res.data.user),
};

export interface DueCounts {
  vocabulary: number;
  verbs: number;
  structures: number;
}

export const languagesApi = {
  getAll: () => api.get<Language[]>('/languages').then((res) => res.data),
  getById: (id: string) => api.get<Language>(`/languages/${id}`).then((res) => res.data),
  create: (data: { name: string; code: string }) =>
    api.post<Language>('/languages', data).then((res) => res.data),
  update: (id: string, data: Partial<{ name: string; code: string; forgetDays: number; sections: string; structureVariantsRequired: number }>) =>
    api.put<Language>(`/languages/${id}`, data).then((res) => res.data),
  delete: (id: string) => api.delete(`/languages/${id}`).then((res) => res.data),
  getDueCounts: (id: string) => api.get<DueCounts>(`/languages/${id}/due-counts`).then((res) => res.data),
};

export const topicsApi = {
  getByLanguageId: (languageId: string) =>
    api.get<Topic[]>(`/languages/${languageId}/topics`).then((res) => res.data),
  getById: (id: string) => api.get<Topic>(`/topics/${id}`).then((res) => res.data),
  create: (languageId: string, data: { name: string; description?: string }) =>
    api.post<Topic>(`/languages/${languageId}/topics`, data).then((res) => res.data),
  update: (id: string, data: Partial<{ name: string; description?: string }>) =>
    api.put<Topic>(`/topics/${id}`, data).then((res) => res.data),
  delete: (id: string) => api.delete(`/topics/${id}`).then((res) => res.data),
};

export const wordsApi = {
  getByTopicId: (topicId: string, params?: { sortBy?: string; limit?: number; offset?: number }) =>
    api.get<Word[]>(`/topics/${topicId}/words`, { params }).then((res) => res.data),
  getById: (id: string) => api.get<Word>(`/words/${id}`).then((res) => res.data),
  create: (topicId: string, data: { term: string; definition: string }) =>
    api.post<Word>(`/topics/${topicId}/words`, data).then((res) => res.data),
  createBatch: (topicId: string, words: { term: string; definition: string }[]) =>
    api.post(`/topics/${topicId}/words/batch`, { words }).then((res) => res.data),
  importForLanguage: (languageId: string, data: { topicName: string; words: { term: string; definition: string }[] }) =>
    api.post<VocabImportResult>(`/languages/${languageId}/vocab/import`, data).then((res) => res.data),
  update: (id: string, data: Partial<{ term: string; definition: string }>) =>
    api.put<Word>(`/words/${id}`, data).then((res) => res.data),
  delete: (id: string) => api.delete(`/words/${id}`).then((res) => res.data),
};

export interface SrsConjugationItem {
  id: string;
  verbId: string;
  tense: string;
  person: string;
  form: string;
  attempts: number;
  correctCount: number;
  successRate: number;
  recentResults: string;
  weightedScore: number;
  srsLevel: number;
  lastTrainedAt: string | null;
  nextReviewAt: string | null;
  label: 'nueva' | 'recordar' | 'atrasada';
  daysSinceLastTrained: number | null;
  verb: { id: string; infinitive: string };
}

export interface SrsConjugationSummary {
  reviewCount: number;
  newCount: number;
  overdueCount: number;
  forgottenCount: number;
  totalCount: number;
  reviewByLevel: Record<number, number>;
  totalInLanguage: number;
  mastered: number;
  inProgress: number;
  pending: number;
}

export const verbSrsApi = {
  getDaily: (
    languageId: string,
    opts?: { newCount?: number; selectionMode?: 'fifo' | 'lifo' | 'random'; verbIds?: string[]; tenses?: string[] }
  ) =>
    api
      .get<{ conjugations: SrsConjugationItem[]; summary: SrsConjugationSummary }>(
        `/languages/${languageId}/verbs/srs/daily`,
        {
          params: {
            ...(opts?.newCount !== undefined ? { newCount: opts.newCount } : {}),
            ...(opts?.selectionMode ? { selectionMode: opts.selectionMode } : {}),
            ...(opts?.verbIds && opts.verbIds.length > 0 ? { verbIds: opts.verbIds.join(',') } : {}),
            ...(opts?.tenses && opts.tenses.length > 0 ? { tenses: opts.tenses.join(',') } : {}),
          },
        }
      )
      .then((r) => r.data),
  validate: (conjugationId: string, answer: string) =>
    api
      .post<{ correct: boolean; expectedAnswer: string; stats: { attempts: number; correctCount: number; successRate: number } }>(
        `/verbs/conjugations/${conjugationId}/srs-validate`,
        { answer }
      )
      .then((r) => r.data),
  advance: (conjugationId: string) =>
    api
      .post<{ ok: true; srsLevel: number; nextReviewAt: string | null }>(`/verbs/conjugations/${conjugationId}/srs-advance`)
      .then((r) => r.data),
};

export const verbsApi = {
  getByLanguageId: (languageId: string) =>
    api.get<Verb[]>(`/languages/${languageId}/verbs`).then((res) => res.data),
  getById: (id: string) => api.get<Verb>(`/verbs/${id}`).then((res) => res.data),
  create: (
    languageId: string,
    data: {
      infinitive: string;
      tenses: string[];
    }
  ) => api.post<Verb>(`/languages/${languageId}/verbs`, data).then((res) => res.data),
  update: (id: string, data: Partial<{ infinitive: string }>) =>
    api.put<Verb>(`/verbs/${id}`, data).then((res) => res.data),
  delete: (id: string) => api.delete(`/verbs/${id}`).then((res) => res.data),
};

export const essaysApi = {
  getByLanguageId: (languageId: string) =>
    api.get<Essay[]>(`/languages/${languageId}/essays`).then((res) => res.data),
  getById: (id: string) => api.get<Essay>(`/essays/${id}`).then((res) => res.data),
  create: (languageId: string, data: { title?: string; text: string; type?: string; grammarItemIds?: string[] }) =>
    api.post<Essay>(`/languages/${languageId}/essays`, data).then((res) => res.data),
  createManual: (languageId: string, data: { title?: string; text: string; errors: { redText: string; fullWord: string; category: string; context: string; start: number; end: number }[] }) =>
    api.post<Essay>(`/languages/${languageId}/essays/manual`, data).then((res) => res.data),
  updateManual: (id: string, data: { title?: string; text: string; errors: { redText: string; fullWord: string; category: string; context: string; start: number; end: number }[] }) =>
    api.put<Essay>(`/essays/${id}`, data).then((res) => res.data),
  getErrorWords: (languageId: string) =>
    api.get<Word[]>(`/languages/${languageId}/essays/errors`).then((res) => res.data),
  getErrorsForTraining: (languageId: string, categories?: string[]) =>
    api.get(`/languages/${languageId}/essays/errors/training`, {
      params: categories ? { categories: categories.join(',') } : {},
    }).then((res) => res.data as { id: string; errorType: string; original: string; corrected: string; sentence: string; blankSentence: string; attempts: number; correctCount: number; successRate: number }[]),
  validateErrorAnswer: (errorId: string, answer: string) =>
    api.post<{ correct: boolean; expectedAnswer: string; stats: { attempts: number; correctCount: number; successRate: number } }>(`/essays/errors/${errorId}/validate`, { answer }).then((res) => res.data),
  delete: (id: string) => api.delete(`/essays/${id}`).then((res) => res.data),
  convertErrorToWord: (essayId: string, errorId: string, topicId: string) =>
    api.post(`/essays/${essayId}/errors/${errorId}/convert`, { topicId }).then((res) => res.data),
};

export interface VocabImportResult {
  topicId: string;
  topicName: string;
  topicCreated: boolean;
  totalProvided: number;
  totalUnique: number;
  alreadyExisting: number;
  inserted: number;
}

// ============== GRAMMAR ==============

import type { GrammarItem, SessionComposition } from '../types';

export const grammarApi = {
  list: (languageId: string) =>
    api.get<GrammarItem[]>(`/languages/${languageId}/grammar`).then((r) => r.data),
  extractFromMarkdown: (languageId: string, markdown: string) =>
    api.post<{ items: { title: string; body: string }[] }>(`/languages/${languageId}/grammar/extract`, { markdown }).then((r) => r.data),
  saveImported: (languageId: string, items: { title: string; body: string }[]) =>
    api.put<GrammarItem[]>(`/languages/${languageId}/grammar`, { items }).then((r) => r.data),
  pick: (languageId: string, count: number) =>
    api.get<{ items: GrammarItem[] }>(`/languages/${languageId}/grammar/pick`, { params: { count } }).then((r) => r.data),
  update: (id: string, data: { title?: string; body?: string }) =>
    api.put<GrammarItem>(`/grammar/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/grammar/${id}`).then((r) => r.data),
};

export interface SrsWord extends Word {
  srsSessionId: string;
  label: 'nueva' | 'recordar' | 'atrasada';
  daysSinceLastTrained: number | null;
  sentence?: string;
  blankSentence?: string;
}

export const srsApi = {
  getMultipleChoiceOptions: (wordId: string) =>
    api.get<{ options: string[]; correctAnswer: string }>(`/srs/multiple-choice/${wordId}`).then((res) => res.data),
  getDailySession: (languageId: string, topicIds?: string[], newWordCount?: number, selectionMode?: string, errorsOnly?: boolean, sessionSize?: number) =>
    api.get(`/srs/${languageId}/daily`, {
      params: {
        ...(topicIds ? { topicIds: topicIds.join(',') } : {}),
        ...(newWordCount !== undefined ? { newWordCount } : {}),
        ...(selectionMode ? { selectionMode } : {}),
        ...(errorsOnly ? { errorsOnly: 'true' } : {}),
        ...(sessionSize !== undefined ? { sessionSize } : {}),
      },
    }).then((res) => res.data as {
      words: SrsWord[];
      summary: { reviewCount: number; newCount: number; overdueCount: number; todayCount: number; todayByLevel: Record<number, number>; overdueByLevel: Record<number, number>; forgottenCount: number; totalCount: number; reviewByLevel: Record<number, number>; totalInLanguage: number; mastered: number; inProgress: number; pending: number } & SessionComposition;
    }),
  addExtraWords: (languageId: string, count: number, topicIds?: string[]) =>
    api.post(`/srs/${languageId}/extra`, { count, topicIds: topicIds?.join(',') }).then((res) => res.data as SrsWord[]),
  markDueReviewed: (languageId: string, mode: 'advance' | 'postpone', opts?: { topicIds?: string[]; dryRun?: boolean }) =>
    api.post(`/srs/${languageId}/mark-reviewed`, { mode, ...(opts?.topicIds ? { topicIds: opts.topicIds } : {}) }, {
      params: opts?.dryRun ? { dryRun: 'true' } : {},
    }).then((res) => res.data as { mode: 'advance' | 'postpone'; count: number; byDate: Record<string, number>; mastered: number; dryRun: boolean }),
  advanceWord: (wordId: string) =>
    api.post(`/srs/words/${wordId}/advance`).then((res) => res.data),
  resetWord: (wordId: string) =>
    api.post(`/srs/words/${wordId}/reset`).then((res) => res.data),
  recordAttempt: (wordId: string, correct: boolean) =>
    api.post(`/srs/words/${wordId}/record-attempt`, { correct }).then((res) => res.data),
};

// ============== STRUCTURES ==============

export interface StructureExample {
  id: string;
  text: string;                // target-language reference translation
  spanish: string | null;      // spanish prompt (null on legacy rows)
  order: number;
  attempts: number;
  correctCount: number;
  lastTrainedAt: string | null;
}

export interface Structure {
  id: string;
  pattern: string;
  category: string;
  hasSlot: boolean;
  languageId: string;
  srsLevel: number;
  lastTrainedAt: string | null;
  nextReviewAt: string | null;
  attempts: number;
  correctCount: number;
  successRate: number;
  recentResults: string;
  weightedScore: number;
  exampleCount: number;
  examples: StructureExample[];
  createdAt: string;
  updatedAt: string;
}

export interface TranslationExampleDraft {
  spanish: string;
  target: string;
}

export interface StructureSessionItem extends Structure {
  label: 'nueva' | 'recordar';
  timeLimitSec: number;
}

export interface StructureSessionSummary {
  reviewCount: number;
  newCount: number;
  overdueCount: number;
  totalCount: number;
  totalInLanguage: number;
  mastered: number;
  inProgress: number;
  pending: number;
  sessionSize?: number;
  reviewsInSession?: number;
  newInSession?: number;
  remainingReviews?: number;
  remainingNew?: number;
  tomorrowCount?: number;
}

export interface JudgeResponse {
  verdict: 'valid' | 'awkward' | 'invalid';
  suggestion?: string;
  reason?: string;
  withinLimit: boolean;
  limitSec: number;
  variantPassed: boolean;
}

export const structuresApi = {
  list: (languageId: string) =>
    api.get<Structure[]>(`/languages/${languageId}/structures`).then((r) => r.data),
  create: (languageId: string, data: { pattern: string; category: string; examples: string[] }) =>
    api.post<Structure>(`/languages/${languageId}/structures`, data).then((r) => r.data),
  update: (id: string, data: Partial<{ pattern: string; category: string; examples: string[] }>) =>
    api.put<Structure>(`/structures/${id}`, data).then((r) => r.data),
  delete: (id: string) => api.delete(`/structures/${id}`).then((r) => r.data),
  getDaily: (languageId: string, newCount?: number, selectionMode?: 'fifo' | 'lifo' | 'random', sessionSize?: number) =>
    api
      .get<{ structures: StructureSessionItem[]; summary: StructureSessionSummary }>(
        `/languages/${languageId}/structures/daily`,
        { params: { ...(newCount !== undefined ? { newCount } : {}), ...(selectionMode ? { selectionMode } : {}), ...(sessionSize !== undefined ? { sessionSize } : {}) } }
      )
      .then((r) => r.data),
  generateCue: (structureId: string, excludeCues?: string[]) =>
    api
      .post<{ cue: string }>(`/structures/${structureId}/cue`, { excludeCues })
      .then((r) => r.data),
  judge: (structureId: string, data: { cue: string; userResponse: string; responseTimeMs: number; recordMetric?: boolean }) =>
    api.post<JudgeResponse>(`/structures/${structureId}/judge`, data).then((r) => r.data),
  suggest: (structureId: string, cue: string) =>
    api.post<{ suggestion: string }>(`/structures/${structureId}/suggest`, { cue }).then((r) => r.data),
  judgeExample: (exampleId: string, answer: string, responseTimeMs?: number) =>
    api
      .post<JudgeExampleResult>(`/structures/examples/${exampleId}/judge`, { answer, responseTimeMs })
      .then((r) => r.data),
  advanceSrs: (structureId: string) =>
    api.post<{ ok: true; newLevel: number; nextReviewAt: string | null }>(`/structures/${structureId}/advance-srs`).then((r) => r.data),
  reschedule: (structureId: string) =>
    api.post<{ ok: true; srsLevel: number; nextReviewAt: string | null }>(`/structures/${structureId}/reschedule`).then((r) => r.data),
  aiScaffold: (
    languageId: string,
    seed: string,
    categories: { value: string; label: string; guide: string }[]
  ) =>
    api
      .post<{ pattern: string; category: string; examples: string[] }>(
        `/languages/${languageId}/structures/ai-scaffold`,
        { seed, categories }
      )
      .then((r) => r.data),
  generateExamples: (structureId: string, count?: number, excludeSpanish?: string[]) =>
    api
      .post<{ examples: TranslationExampleDraft[] }>(
        `/structures/${structureId}/examples/generate`,
        { count, excludeSpanish }
      )
      .then((r) => r.data),
  replaceExamples: (structureId: string, examples: TranslationExampleDraft[], exampleCount?: number) =>
    api
      .put<Structure>(`/structures/${structureId}/examples`, { examples, exampleCount })
      .then((r) => r.data),
  setExampleCount: (structureId: string, exampleCount: number) =>
    api
      .put<{ ok: true; exampleCount: number }>(`/structures/${structureId}/example-count`, { exampleCount })
      .then((r) => r.data),
  recordExampleAttempt: (exampleId: string, correct: boolean) =>
    api
      .post<{ id: string; attempts: number; correctCount: number; lastTrainedAt: string | null }>(
        `/structures/examples/${exampleId}/attempt`,
        { correct }
      )
      .then((r) => r.data),
};

export type Cefr = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
export interface BookToken { i: number; s: number; e: number; t: string; w: boolean }
export interface BookAnnotation { i: number; span: number; lemma: string; gloss: string; def?: string; cefr: Cefr }
export interface BookSummaryItem {
  id: string;
  languageId?: string;
  title: string;
  author: string | null;
  status: string;
  totalPages: number;
  totalWords: number;
  lastPageIndex: number;
  annotatedPages: number;
  estimatedCostUsd: number;
  createdAt: string;
}
export interface BookBookmark { pageIndex: number; createdAt: string; snippet: string }
export interface BookDetail extends BookSummaryItem { languageId?: string; chapters: { index: number; title: string }[]; bookmarks?: number[] }
export interface BookPageData {
  index: number;
  chapterTitle: string | null;
  text: string;
  tokens: BookToken[];
  annotations: BookAnnotation[];
  totalPages: number;
  savedLemmas: string[];
  highlights?: Pick<BookHighlight, 'id' | 'startToken' | 'endToken' | 'translation'>[];
}
export interface BookHighlight {
  id: string;
  pageIndex: number;
  startToken: number;
  endToken: number;
  text: string;
  translation: string | null;
  createdAt: string;
}
export interface BookRangeSummary { fromIndex: number; toIndex: number; text: string; tokens: BookToken[]; annotations: BookAnnotation[] }
export interface SavedWord {
  lemma: string;
  term: string;
  definition: string;
  wordId: string;
  srsLevel: number;
  attempts: number;
  correctCount: number;
  createdAt: string;
}

export interface ReannotateReadResult {
  done: number;
  failed: { index: number; error: string }[];
  remaining: number;
  nextAfterIndex: number;
}

export const booksApi = {
  reannotatePage: (bookId: string, index: number) =>
    api.post<BookPageData>(`/books/${bookId}/pages/${index}/reannotate`).then((r) => r.data),
  reannotateRead: (bookId: string, limit = 40, afterIndex?: number) =>
    api
      .post<ReannotateReadResult>(`/books/${bookId}/reannotate-read`, { limit, afterIndex })
      .then((r) => r.data),
  list: (languageId: string) =>
    api.get<BookSummaryItem[]>(`/languages/${languageId}/books`).then((r) => r.data),
  upload: (languageId: string, form: FormData) =>
    api
      .post<BookSummaryItem>(`/languages/${languageId}/books`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),
  get: (bookId: string) => api.get<BookDetail>(`/books/${bookId}`).then((r) => r.data),
  getPage: (bookId: string, index: number) =>
    api.get<BookPageData>(`/books/${bookId}/pages/${index}`).then((r) => r.data),
  bookmarks: (bookId: string) =>
    api.get<BookBookmark[]>(`/books/${bookId}/bookmarks`).then((r) => r.data),
  addBookmark: (bookId: string, pageIndex: number) =>
    api.put(`/books/${bookId}/bookmarks/${pageIndex}`).then((r) => r.data),
  highlights: (bookId: string) =>
    api.get<BookHighlight[]>(`/books/${bookId}/highlights`).then((r) => r.data),
  createHighlight: (bookId: string, a: { pageIndex: number; startToken: number; endToken: number }) =>
    api.post<BookHighlight>(`/books/${bookId}/highlights`, a).then((r) => r.data),
  deleteHighlight: (bookId: string, id: string) =>
    api.delete(`/books/${bookId}/highlights/${id}`).then((r) => r.data),
  removeBookmark: (bookId: string, pageIndex: number) =>
    api.delete(`/books/${bookId}/bookmarks/${pageIndex}`).then((r) => r.data),
  updateProgress: (bookId: string, lastPageIndex: number) =>
    api.put(`/books/${bookId}/progress`, { lastPageIndex }).then((r) => r.data),
  createSummary: (bookId: string, fromIndex: number, toIndex: number) =>
    api.post<BookRangeSummary>(`/books/${bookId}/summaries`, { fromIndex, toIndex }).then((r) => r.data),
  savedWords: (bookId: string) =>
    api.get<SavedWord[]>(`/books/${bookId}/saved-words`).then((r) => r.data),
  saveWord: (bookId: string, a: { lemma: string; gloss: string; def?: string }) =>
    api
      .post<{ wordId: string; lemma: string; gloss: string }>(`/books/${bookId}/saved-words`, a)
      .then((r) => r.data),
  unsaveWord: (bookId: string, lemma: string) =>
    api.delete(`/books/${bookId}/saved-words/${encodeURIComponent(lemma)}`).then((r) => r.data),
  reprocess: (bookId: string) => api.post<BookDetail>(`/books/${bookId}/reprocess`).then((r) => r.data),
  delete: (bookId: string) => api.delete(`/books/${bookId}`).then((r) => r.data),
};

export default api;
