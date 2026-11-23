import { scheduleNext } from '../utils/srsSchedule';
import { prisma } from '../utils/prisma';
import { calculateSuccessRate, calculateWeightedScore, validateConjugationAnswer } from '../utils/validation';

const SRS_INTERVALS: Record<number, number> = {
  0: 0,
  1: 3,
  2: 7,
  3: 15,
  4: 30,
};
const MAX_SRS_LEVEL = 6;

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
// Adaptive default count of NEW tenses (each tense = up to 6 conjugations).
function getNewCount(reviewCount: number): number {
  if (reviewCount <= 10) return 4;
  if (reviewCount <= 20) return 2;
  return 1;
}

export const verbSrsService = {
  async getDaily(
    languageId: string,
    newCount?: number,
    selectionMode: 'fifo' | 'lifo' | 'random' = 'fifo',
    verbIds?: string[],
    tenses?: string[]
  ) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const baseFilter: any = {
      verb: { languageId, ...(verbIds && verbIds.length > 0 ? { id: { in: verbIds } } : {}) },
      ...(tenses && tenses.length > 0 ? { tense: { in: tenses } } : {}),
    };

    // Overdue items are NOT penalized (user decision 2026-10-11): they stay due with the 'atrasada' label until trained.
    const overdue = await prisma.verbConjugation.findMany({
      where: { ...baseFilter, srsLevel: { gt: 0, lt: MAX_SRS_LEVEL }, nextReviewAt: { lt: todayStart } },
    });

    // Step 2: forgotten mastered
    const language = await prisma.language.findUnique({ where: { id: languageId } });
    const forgetDays = language?.forgetDays || 180;
    const forgetDate = addDays(now, -forgetDays);
    const forgotten = await prisma.verbConjugation.findMany({
      where: { ...baseFilter, srsLevel: MAX_SRS_LEVEL, lastTrainedAt: { lt: forgetDate } },
    });
    if (forgotten.length > 0) {
      await prisma.$transaction(
        forgotten.map((c) =>
          prisma.verbConjugation.update({
            where: { id: c.id },
            data: { srsLevel: 0, lastTrainedAt: null, nextReviewAt: null },
          })
        )
      );
    }

    // Step 3: reviews due today
    const reviews = await prisma.verbConjugation.findMany({
      where: { ...baseFilter, srsLevel: { gt: 0, lt: MAX_SRS_LEVEL }, nextReviewAt: { lte: todayEnd } },
      include: { verb: { select: { id: true, infinitive: true } } },
      orderBy: [{ srsLevel: 'asc' }, { successRate: 'asc' }],
    });

    // Step 4: new tenses (each tense = up to 6 pending conjugations of the same
    // (verbId, tense) group). newCount is measured in TENSES, not conjugations.
    const requestedNewTenses = newCount ?? getNewCount(reviews.length);

    const allPending = await prisma.verbConjugation.findMany({
      where: { ...baseFilter, srsLevel: 0, lastTrainedAt: null },
      include: { verb: { select: { id: true, infinitive: true } } },
      orderBy: [{ createdAt: 'asc' as const }],
    });

    // Group by (verbId, tense); preserve insertion order for fifo.
    const groupsMap = new Map<string, typeof allPending>();
    for (const c of allPending) {
      const key = `${c.verbId}::${c.tense}`;
      if (!groupsMap.has(key)) groupsMap.set(key, []);
      groupsMap.get(key)!.push(c);
    }
    let orderedGroupKeys = Array.from(groupsMap.keys());
    if (selectionMode === 'lifo') {
      orderedGroupKeys.reverse();
    } else if (selectionMode === 'random') {
      for (let i = orderedGroupKeys.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderedGroupKeys[i], orderedGroupKeys[j]] = [orderedGroupKeys[j], orderedGroupKeys[i]];
      }
    }
    const selectedKeys = orderedGroupKeys.slice(0, requestedNewTenses);
    const news = selectedKeys.flatMap((k) => groupsMap.get(k) || []);

    const overdueIds = new Set(overdue.map((c) => c.id));
    const now2 = new Date();
    const conjugations = [
      ...reviews.map((c) => ({
        ...c,
        label: (overdueIds.has(c.id) ? 'atrasada' : 'recordar') as 'atrasada' | 'recordar' | 'nueva',
        daysSinceLastTrained: c.lastTrainedAt
          ? Math.floor((now2.getTime() - c.lastTrainedAt.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      })),
      ...news.map((c) => ({
        ...c,
        label: 'nueva' as 'atrasada' | 'recordar' | 'nueva',
        daysSinceLastTrained: null as number | null,
      })),
    ];

    const reviewByLevel: Record<number, number> = {};
    for (const c of reviews) reviewByLevel[c.srsLevel] = (reviewByLevel[c.srsLevel] || 0) + 1;

    const total = await prisma.verbConjugation.count({ where: baseFilter });
    const mastered = await prisma.verbConjugation.count({ where: { ...baseFilter, srsLevel: MAX_SRS_LEVEL } });
    const inProgress = await prisma.verbConjugation.count({
      where: { ...baseFilter, srsLevel: { gt: 0, lt: MAX_SRS_LEVEL } },
    });
    const pending = await prisma.verbConjugation.count({
      where: { ...baseFilter, srsLevel: 0, lastTrainedAt: null },
    });

    return {
      conjugations,
      summary: {
        reviewCount: reviews.length,
        newCount: news.length,
        overdueCount: overdue.length,
        forgottenCount: forgotten.length,
        totalCount: conjugations.length,
        reviewByLevel,
        totalInLanguage: total,
        mastered,
        inProgress,
        pending,
      },
    };
  },

  /** Validate an answer + record metric. Does NOT advance SRS. */
  async validateAttempt(conjugationId: string, answer: string) {
    const c = await prisma.verbConjugation.findUnique({ where: { id: conjugationId } });
    if (!c) throw new Error('Conjugation not found');
    const correct = validateConjugationAnswer(answer, c.form);

    const newAttempts = c.attempts + 1;
    const newCorrectCount = correct ? c.correctCount + 1 : c.correctCount;
    const newSuccessRate = calculateSuccessRate(newCorrectCount, newAttempts);
    const recent = (c.recentResults + (correct ? '1' : '0')).slice(-30);
    const newWeightedScore = calculateWeightedScore(recent);

    await prisma.verbConjugation.update({
      where: { id: conjugationId },
      data: {
        attempts: newAttempts,
        correctCount: newCorrectCount,
        successRate: newSuccessRate,
        recentResults: recent,
        weightedScore: newWeightedScore,
      },
    });

    return {
      correct,
      expectedAnswer: c.form,
      stats: { attempts: newAttempts, correctCount: newCorrectCount, successRate: newSuccessRate },
    };
  },

  /** Advance the conjugation's SRS level (called after a correct first-try attempt). */
  async advance(conjugationId: string) {
    const c = await prisma.verbConjugation.findUnique({ where: { id: conjugationId } });
    if (!c) throw new Error('Conjugation not found');
    const now = new Date();
    const newLevel = c.srsLevel + 1 >= 5 ? MAX_SRS_LEVEL : c.srsLevel + 1;
    if (newLevel >= MAX_SRS_LEVEL) {
      return prisma.verbConjugation.update({
        where: { id: conjugationId },
        data: { srsLevel: MAX_SRS_LEVEL, lastTrainedAt: now, nextReviewAt: null },
      });
    }
    return prisma.verbConjugation.update({
      where: { id: conjugationId },
      data: {
        srsLevel: newLevel,
        lastTrainedAt: now,
        nextReviewAt: scheduleNext(now, SRS_INTERVALS[newLevel] ?? 30),
      },
    });
  },
};
