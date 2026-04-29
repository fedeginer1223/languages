import { prisma } from '../utils/prisma';

// SRS intervals in days: level -> days until next review
const SRS_INTERVALS: Record<number, number> = {
  0: 0,   // new word, train today
  1: 3,   // review after 3 days
  2: 7,   // review after 7 days
  3: 15,  // review after 15 days
  4: 30,  // review after 30 days
  5: 90,  // review after 90 days
  6: 365, // mastered, review after 1 year
};

const MAX_SRS_LEVEL = 6;
const NEW_WORDS_PER_DAY = 7;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  result.setHours(0, 0, 0, 0);
  return result;
}

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function endOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

export const srsService = {
  /**
   * Get today's SRS session: due reviews + new words
   */
  async getDailySession(languageId: string) {
    const now = new Date();
    const todayEnd = endOfDay(now);

    // 1. Get words due for review (nextReviewAt <= end of today)
    const dueWords = await prisma.word.findMany({
      where: {
        topic: { languageId },
        source: 'vocabulary',
        srsLevel: { gt: 0 },
        nextReviewAt: { lte: todayEnd },
      },
      orderBy: [{ nextReviewAt: 'asc' }, { successRate: 'asc' }],
    });

    // 2. Get new words (srsLevel = 0, never trained via SRS)
    const newWords = await prisma.word.findMany({
      where: {
        topic: { languageId },
        source: 'vocabulary',
        srsLevel: 0,
        lastTrainedAt: null,
      },
      orderBy: [{ successRate: 'asc' }, { attempts: 'asc' }],
      take: NEW_WORDS_PER_DAY,
    });

    // Group due words by SRS level for display
    const dueByLevel: Record<number, number> = {};
    for (const w of dueWords) {
      dueByLevel[w.srsLevel] = (dueByLevel[w.srsLevel] || 0) + 1;
    }

    return {
      dueWords,
      newWords,
      summary: {
        dueCount: dueWords.length,
        newCount: newWords.length,
        totalCount: dueWords.length + newWords.length,
        dueByLevel,
      },
    };
  },

  /**
   * Advance a word's SRS level after correct answer
   */
  async advanceWord(wordId: string) {
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw new Error('Word not found');

    const now = new Date();
    const newLevel = Math.min(word.srsLevel + 1, MAX_SRS_LEVEL);
    const daysUntilNext = SRS_INTERVALS[newLevel] || 365;

    return prisma.word.update({
      where: { id: wordId },
      data: {
        srsLevel: newLevel,
        lastTrainedAt: now,
        nextReviewAt: addDays(now, daysUntilNext),
      },
    });
  },

  /**
   * Reset a word's SRS level after incorrect answer
   */
  async resetWord(wordId: string) {
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw new Error('Word not found');

    const now = new Date();

    return prisma.word.update({
      where: { id: wordId },
      data: {
        srsLevel: 1, // reset to level 1 (review in 3 days)
        lastTrainedAt: now,
        nextReviewAt: addDays(now, SRS_INTERVALS[1]),
      },
    });
  },

  /**
   * Get SRS stats for a language
   */
  async getStats(languageId: string) {
    const words = await prisma.word.findMany({
      where: { topic: { languageId }, source: 'vocabulary' },
      select: { srsLevel: true, nextReviewAt: true },
    });

    const byLevel: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const w of words) {
      byLevel[w.srsLevel] = (byLevel[w.srsLevel] || 0) + 1;
    }

    const now = new Date();
    const todayEnd = endOfDay(now);
    const dueToday = words.filter(w => w.srsLevel > 0 && w.nextReviewAt && w.nextReviewAt <= todayEnd).length;

    return {
      totalWords: words.length,
      byLevel,
      dueToday,
      mastered: byLevel[6] || 0,
      newWords: byLevel[0] || 0,
    };
  },

  /**
   * Mark a word as SRS level 0 (start from batch training)
   */
  async initFromBatchTraining(wordId: string) {
    const now = new Date();
    return prisma.word.update({
      where: { id: wordId },
      data: {
        srsLevel: 1,
        lastTrainedAt: now,
        nextReviewAt: addDays(now, SRS_INTERVALS[1]),
      },
    });
  },
};
