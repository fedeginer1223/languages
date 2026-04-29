import axios from 'axios';
import type {
  Language,
  Topic,
  Word,
  Verb,
  Essay,
  TrainingSession,
  ValidationResult,
  Stats,
  ErrorStats,
} from '../types';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

export const languagesApi = {
  getAll: () => api.get<Language[]>('/languages').then((res) => res.data),
  getById: (id: string) => api.get<Language>(`/languages/${id}`).then((res) => res.data),
  create: (data: { name: string; code: string }) =>
    api.post<Language>('/languages', data).then((res) => res.data),
  update: (id: string, data: Partial<{ name: string; code: string }>) =>
    api.put<Language>(`/languages/${id}`, data).then((res) => res.data),
  delete: (id: string) => api.delete(`/languages/${id}`).then((res) => res.data),
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
  update: (id: string, data: Partial<{ term: string; definition: string }>) =>
    api.put<Word>(`/words/${id}`, data).then((res) => res.data),
  delete: (id: string) => api.delete(`/words/${id}`).then((res) => res.data),
};

export interface TrainingSessionSummary {
  sessionId: string;
  name: string | null;
  mode: string;
  trainingType: 'batch' | 'srs';
  totalQuestions: number;
  currentIndex: number;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
  stats: {
    answered: number;
    correct: number;
    total: number;
    accuracy: number;
  };
}

export const trainingApi = {
  listSessions: (languageId: string) =>
    api.get<TrainingSessionSummary[]>('/training/sessions', { params: { languageId } }).then((res) => res.data),
  createSession: (params: {
    mode?: string;
    trainingType?: string;
    topicId?: string;
    topicIds?: string;
    languageId?: string;
    limit?: number;
    minErrorRate?: number;
  }) => api.get<TrainingSession>('/training/session', { params }).then((res) => res.data),
  getSession: (sessionId: string) =>
    api.get<TrainingSession>(`/training/session/${sessionId}`).then((res) => res.data),
  updateSessionProgress: (sessionId: string, currentIndex: number) =>
    api.put(`/training/session/${sessionId}/progress`, { currentIndex }).then((res) => res.data),
  renameSession: (sessionId: string, name: string) =>
    api.put(`/training/session/${sessionId}/name`, { name }).then((res) => res.data),
  endSession: (sessionId: string) =>
    api.post(`/training/session/${sessionId}/end`).then((res) => res.data),
  deleteSession: (sessionId: string) =>
    api.delete(`/training/session/${sessionId}`).then((res) => res.data),
  validateAnswer: (data: { sessionId: string; wordId: string; answer: string }) =>
    api.post<ValidationResult>('/training/validate', data).then((res) => res.data),
  getMultipleChoiceOptions: (wordId: string) =>
    api.get<{ options: string[]; correctAnswer: string }>(`/training/multiple-choice/${wordId}`).then((res) => res.data),
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
  getPracticeQuestions: (id: string, tenses?: string[]) =>
    api.get(`/verbs/${id}/practice`, { params: { tenses } }).then((res) => res.data),
  validateConjugation: (id: string, answer: string) =>
    api.post<ValidationResult>(`/verbs/conjugations/${id}/validate`, { answer }).then((res) => res.data),
};

export const essaysApi = {
  getByLanguageId: (languageId: string) =>
    api.get<Essay[]>(`/languages/${languageId}/essays`).then((res) => res.data),
  getById: (id: string) => api.get<Essay>(`/essays/${id}`).then((res) => res.data),
  create: (languageId: string, data: { title?: string; text: string }) =>
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

export const srsApi = {
  getDailySession: (languageId: string) =>
    api.get(`/srs/${languageId}/daily`).then((res) => res.data as {
      dueWords: Word[];
      newWords: Word[];
      summary: { dueCount: number; newCount: number; totalCount: number; dueByLevel: Record<number, number> };
    }),
  getStats: (languageId: string) =>
    api.get(`/srs/${languageId}/stats`).then((res) => res.data as {
      totalWords: number; byLevel: Record<number, number>; dueToday: number; mastered: number; newWords: number;
    }),
  advanceWord: (wordId: string) =>
    api.post(`/srs/words/${wordId}/advance`).then((res) => res.data),
  resetWord: (wordId: string) =>
    api.post(`/srs/words/${wordId}/reset`).then((res) => res.data),
};

export const statsApi = {
  getLanguageStats: (languageId: string) =>
    api.get<Stats>(`/stats/languages/${languageId}`).then((res) => res.data),
  getErrorStats: (languageId?: string) =>
    api.get<ErrorStats>('/stats/errors', { params: { languageId } }).then((res) => res.data),
};

export default api;
