import { scheduleNext } from '../utils/srsSchedule';
import { prisma } from '../utils/prisma';
import { calculateWeightedScore } from '../utils/validation';
import { structureAiService } from './structureAiService';
import { composeSession, clampSessionSize, DEFAULT_SESSION_SIZE } from '../utils/sessionComposer';

const SRS_INTERVALS: Record<number, number> = { 0: 0, 1: 3, 2: 7, 3: 15, 4: 30 };
const MAX_SRS_LEVEL = 6;

// Time limits per SRS level (seconds). Drops as fluency builds.
const TIME_LIMITS_SEC: Record<number, number> = {
  0: 15, 1: 12, 2: 10, 3: 8, 4: 6, 5: 5, 6: 5,
};

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  r.setHours(0, 0, 0, 0);
  return r;
}
function endOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}
function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const structureSrsService = {
  getTimeLimit(srsLevel: number): number {
    return TIME_LIMITS_SEC[Math.min(Math.max(srsLevel, 0), MAX_SRS_LEVEL)];
  },

  /**
   * Build today's session. Picks structures due (review or overdue) + N new ones,
   * interleaved in random order. Overdue penalty: same logic as vocabulary.
   */
  async getDaily(languageId: string, newCount?: number, selectionMode: 'fifo' | 'lifo' | 'random' = 'fifo', sessionSize?: number) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    // sessionSize wins; legacy newCount alone keeps the old "all reviews + N new" behaviour.
    const legacy = sessionSize === undefined && newCount !== undefined;
    const size = clampSessionSize(sessionSize ?? DEFAULT_SESSION_SIZE);
    const candidateCount = legacy ? newCount! : size;

    // Overdue items are NOT penalized (user decision 2026-10-11): they stay due with the 'atrasada' label until trained.
    const overdueIds = await prisma.structure.findMany({
      where: {
        languageId,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { lt: todayStart },
      },
      select: { id: true, srsLevel: true },
    });

    // 2. Forgotten mastered: MAX-level structures whose lastTrainedAt was long
    // ago get demoted back to level 0 so they cycle back through practice.
    // Same idea as vocabulary's forgotten-mastered step.
    const language = await prisma.language.findUnique({
      where: { id: languageId },
      select: { forgetDays: true },
    });
    const forgetDays = language?.forgetDays ?? 180;
    const forgetCutoff = addDays(now, -forgetDays);
    const forgotten = await prisma.structure.findMany({
      where: {
        languageId,
        srsLevel: MAX_SRS_LEVEL,
        lastTrainedAt: { lt: forgetCutoff },
      },
      select: { id: true },
    });
    if (forgotten.length > 0) {
      await prisma.$transaction(
        forgotten.map((s) =>
          prisma.structure.update({
            where: { id: s.id },
            data: { srsLevel: 0, lastTrainedAt: null, nextReviewAt: null },
          })
        )
      );
    }

    // 3. Review-due structures (scheduled today or earlier, level 1-5)
    const reviewStructures = await prisma.structure.findMany({
      where: {
        languageId,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { lte: todayEnd },
      },
      include: { examples: { orderBy: { order: 'asc' } } },
      // Most overdue first, ties by higher level.
      orderBy: [{ nextReviewAt: 'asc' }, { srsLevel: 'desc' }],
    });

    // 4. New structures (srsLevel 0, never trained)
    const newAvailable = await prisma.structure.findMany({
      where: { languageId, srsLevel: 0, lastTrainedAt: null },
      include: { examples: { orderBy: { order: 'asc' } } },
      orderBy: selectionMode === 'lifo' ? { createdAt: 'desc' } : { createdAt: 'asc' },
    });

    let newStructures =
      selectionMode === 'random'
        ? shuffle(newAvailable).slice(0, candidateCount)
        : newAvailable.slice(0, candidateCount);

    // Compose the session (priority order is applied BEFORE trimming).
    const composed = legacy
      ? { reviews: reviewStructures, newItems: newStructures, remainingReviews: 0, remainingNew: 0 }
      : composeSession({ reviews: reviewStructures, newItems: newStructures, sessionSize: size });
    const sessionReviews = composed.reviews;
    newStructures = composed.newItems;

    // 5. Interleave — shuffled only AFTER choosing which items make the session.
    const combined = shuffle([...sessionReviews, ...newStructures]);

    const tomorrowStart = addDays(now, 1);
    const tomorrowCount = await prisma.structure.count({
      where: {
        languageId,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { gte: tomorrowStart, lte: endOfDay(tomorrowStart) },
      },
    });

    // 6. Stats
    const totalInLanguage = await prisma.structure.count({ where: { languageId } });
    const mastered = await prisma.structure.count({
      where: { languageId, srsLevel: MAX_SRS_LEVEL },
    });
    const inProgress = await prisma.structure.count({
      where: { languageId, srsLevel: { gt: 0, lt: MAX_SRS_LEVEL } },
    });
    const pending = await prisma.structure.count({
      where: { languageId, srsLevel: 0, lastTrainedAt: null },
    });

    return {
      structures: combined.map((s) => ({
        ...s,
        label: s.srsLevel === 0 && !s.lastTrainedAt ? 'nueva' : 'recordar',
        timeLimitSec: structureSrsService.getTimeLimit(s.srsLevel),
      })),
      summary: {
        reviewCount: reviewStructures.length,
        newCount: newStructures.length,
        overdueCount: overdueIds.length,
        forgottenCount: forgotten.length,
        totalCount: combined.length,
        totalInLanguage,
        mastered,
        inProgress,
        pending,
        sessionSize: legacy ? combined.length : size,
        reviewsInSession: sessionReviews.length,
        newInSession: newStructures.length,
        remainingReviews: reviewStructures.length - sessionReviews.length,
        remainingNew: Math.max(0, pending - newStructures.length),
        tomorrowCount,
      },
    };
  },

  /**
   * Generate a cue for a structure (calls AI). Optionally excludes cues already
   * shown in this session.
   */
  async generateCue(structureId: string, languageName: string, excludeCues?: string[]) {
    const structure = await prisma.structure.findUnique({
      where: { id: structureId },
      include: { examples: { orderBy: { order: 'asc' } } },
    });
    if (!structure) throw new Error('Structure not found');

    const cue = await structureAiService.generateCue({
      languageName,
      pattern: structure.pattern,
      examples: structure.examples.map((e) => e.text),
      category: structure.category,
      excludeCues,
    });
    return { cue };
  },

  /**
   * Judge a single variant with the AI. Records the attempt, updates dominio
   * metrics + lastTrainedAt, but does NOT touch srsLevel/nextReviewAt.
   *
   * SRS advancement is committed separately via advanceSrs() after the user
   * passes ALL variants for the structure (handled by the frontend).
   */
  async judge(input: {
    structureId: string;
    languageName: string;
    cue: string;
    userResponse: string;
    responseTimeMs: number;
    /** If false, the AI verdict is returned without logging the attempt or updating
     *  dominio metrics. Used by the frontend during remediation (after empty or
     *  invalid initial submit) so retries don't pollute the score. */
    recordMetric?: boolean;
  }) {
    const structure = await prisma.structure.findUnique({
      where: { id: input.structureId },
      include: { examples: { orderBy: { order: 'asc' } } },
    });
    if (!structure) throw new Error('Structure not found');

    const limitSec = structureSrsService.getTimeLimit(structure.srsLevel);
    const withinLimit = input.responseTimeMs <= limitSec * 1000;

    let judgement;
    if (!input.userResponse.trim()) {
      judgement = { verdict: 'invalid' as const, reason: 'sin respuesta' };
    } else {
      judgement = await structureAiService.judgeVariant({
        languageName: input.languageName,
        pattern: structure.pattern,
        examples: structure.examples.map((e) => e.text),
        cue: input.cue,
        userResponse: input.userResponse,
      });
    }

    const recordMetric = input.recordMetric !== false;

    if (recordMetric) {
      await prisma.structureAttempt.create({
        data: {
          structureId: structure.id,
          cue: input.cue,
          userResponse: input.userResponse,
          verdict: judgement.verdict,
          suggestion: judgement.suggestion,
          responseTimeMs: input.responseTimeMs,
          withinLimit,
        },
      });

      // Dominio metric: awkward counts as success (pattern used), invalid does not
      const successForMetric = judgement.verdict !== 'invalid';
      const recentResults = (structure.recentResults + (successForMetric ? '1' : '0')).slice(-30);
      const weightedScore = calculateWeightedScore(recentResults);
      const attempts = structure.attempts + 1;
      const correctCount = structure.correctCount + (successForMetric ? 1 : 0);
      const successRate = attempts > 0 ? (correctCount / attempts) * 100 : 0;

      await prisma.structure.update({
        where: { id: structure.id },
        data: {
          lastTrainedAt: new Date(),
          attempts,
          correctCount,
          successRate,
          recentResults,
          weightedScore,
        },
      });
    }

    return {
      verdict: judgement.verdict,
      suggestion: judgement.suggestion,
      reason: judgement.reason,
      withinLimit,
      limitSec,
      // The frontend uses this hint to decide if this variant was "good enough"
      // to keep the streak going within a multi-variant session.
      variantPassed: judgement.verdict === 'valid' && withinLimit,
    };
  },

  /**
   * Commit an SRS level advancement for a structure. Called by the frontend
   * after all variants of a structure in this session were valid + on time.
   */
  async advanceSrs(structureId: string) {
    const structure = await prisma.structure.findUnique({ where: { id: structureId } });
    if (!structure) throw new Error('Structure not found');

    const now = new Date();
    const newLevel = structure.srsLevel + 1 >= 5 ? MAX_SRS_LEVEL : structure.srsLevel + 1;
    const nextReviewAt =
      newLevel >= MAX_SRS_LEVEL ? null : scheduleNext(now, SRS_INTERVALS[newLevel] ?? 3);

    return prisma.structure.update({
      where: { id: structureId },
      data: { srsLevel: newLevel, lastTrainedAt: now, nextReviewAt },
    });
  },

  /**
   * Reschedule a structure at the SAME level. Called when the user trained
   * the structure but missed at least one variant (so no SRS advance), to
   * avoid leaving nextReviewAt in the past which would cause the overdue
   * penalty to trigger perpetually.
   */
  async rescheduleSameLevel(structureId: string) {
    const structure = await prisma.structure.findUnique({ where: { id: structureId } });
    if (!structure) throw new Error('Structure not found');
    // If the structure is still at level 0 (never learned), don't schedule.
    // If mastered (level 6), don't schedule either — forgetDays handles it.
    if (structure.srsLevel <= 0 || structure.srsLevel >= MAX_SRS_LEVEL) {
      return structure;
    }
    const now = new Date();
    const nextReviewAt = scheduleNext(now, SRS_INTERVALS[structure.srsLevel] ?? 3);
    return prisma.structure.update({
      where: { id: structureId },
      data: { lastTrainedAt: now, nextReviewAt },
    });
  },
};
