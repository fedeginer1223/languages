import { prisma } from '../utils/prisma';

export const statsService = {
  async getLanguageStats(languageId: string) {
    const language = await prisma.language.findUnique({
      where: { id: languageId },
      include: {
        topics: {
          include: {
            words: true,
          },
        },
        verbs: {
          include: {
            conjugations: true,
          },
        },
        essays: true,
      },
    });

    if (!language) {
      throw new Error('Language not found');
    }

    const allWords = language.topics.flatMap((t) => t.words);
    const avgSuccessRate =
      allWords.length > 0
        ? allWords.reduce((sum, w) => sum + w.successRate, 0) / allWords.length
        : 0;

    const mostDifficultWords = allWords
      .filter((w) => w.attempts > 0)
      .sort((a, b) => a.successRate - b.successRate)
      .slice(0, 5)
      .map((w) => ({
        id: w.id,
        term: w.term,
        successRate: w.successRate,
        attempts: w.attempts,
      }));

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentWords = allWords.filter(
      (w) => w.updatedAt >= sevenDaysAgo && w.attempts > 0
    );

    const recentActivity = {
      last7Days: {
        attempts: recentWords.reduce((sum, w) => sum + w.attempts, 0),
        correctCount: recentWords.reduce((sum, w) => sum + w.correctCount, 0),
        successRate:
          recentWords.length > 0
            ? Math.round(
                (recentWords.reduce((sum, w) => sum + w.correctCount, 0) /
                  recentWords.reduce((sum, w) => sum + w.attempts, 0)) *
                  1000
              ) / 10
            : 0,
      },
    };

    return {
      languageId: language.id,
      topicsCount: language.topics.length,
      wordsCount: allWords.length,
      verbsCount: language.verbs.length,
      essaysCount: language.essays.length,
      avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
      mostDifficultWords,
      recentActivity,
    };
  },

  async getErrorStats(languageId?: string) {
    const whereClause = languageId
      ? {
          correction: {
            essay: {
              languageId,
            },
          },
        }
      : {};

    const errors = await prisma.error.findMany({
      where: whereClause,
      include: {
        correction: {
          include: {
            essay: true,
          },
        },
      },
    });

    const byType = errors.reduce(
      (acc, error) => {
        acc[error.errorType] = (acc[error.errorType] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    const errorMap = new Map<string, { original: string; corrected: string; count: number }>();

    errors.forEach((error) => {
      const key = `${error.original}|${error.corrected}`;
      const existing = errorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        errorMap.set(key, {
          original: error.original,
          corrected: error.corrected,
          count: 1,
        });
      }
    });

    const mostCommonErrors = Array.from(errorMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((e) => ({
        original: e.original,
        corrected: e.corrected,
        occurrences: e.count,
      }));

    return {
      totalErrors: errors.length,
      byType,
      mostCommonErrors,
    };
  },
};
