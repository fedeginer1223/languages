import { scheduleNext } from '../utils/srsSchedule';
import { prisma } from '../utils/prisma';
import { wordService } from './wordService';

// SRS intervals in days: level -> days until next review
const SRS_INTERVALS: Record<number, number> = {
  0: 0,   // new word, train today
  1: 3,
  2: 7,
  3: 15,
  4: 30,
};

const MAX_SRS_LEVEL = 6; // mastered

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

function getNewWordCount(reviewCount: number): number {
  if (reviewCount <= 10) return 7;
  if (reviewCount <= 20) return 5;
  if (reviewCount <= 30) return 3;
  return 0;
}

export const srsService = {
  /**
   * Bulk "mark overdue words as reviewed" (language-wide vocabulary). Overdue only: nextReviewAt before the start of today; words due today are untouched.
   * advance: treated as answered correctly. postpone: keep level, reschedule only.
   */
  async markDueReviewed(
    languageId: string,
    mode: 'advance' | 'postpone',
    opts: { topicIds?: string[]; dryRun?: boolean } = {}
  ) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const topicFilter: any = { languageId, name: { not: 'Errores de redacción' } };
    if (opts.topicIds && opts.topicIds.length > 0) topicFilter.id = { in: opts.topicIds };

    const words = await prisma.word.findMany({
      where: {
        topic: topicFilter,
        source: 'vocabulary',
        srsLevel: { gte: 1, lte: 5 },
        nextReviewAt: { lt: todayStart },
      },
      select: { id: true, srsLevel: true },
    });

    const byDate: Record<string, number> = {};
    let mastered = 0;
    const updates = words.map((w) => {
      const newLevel = mode === 'advance' ? w.srsLevel + 1 >= 5 ? MAX_SRS_LEVEL : w.srsLevel + 1 : w.srsLevel;
      let nextReviewAt: Date | null;
      if (mode === 'advance' && newLevel >= MAX_SRS_LEVEL) {
        nextReviewAt = null;
        mastered++;
      } else {
        nextReviewAt = scheduleNext(now, SRS_INTERVALS[newLevel] ?? 3);
        const d = nextReviewAt;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        byDate[key] = (byDate[key] || 0) + 1;
      }
      const data: any = mode === 'advance'
        ? { srsLevel: newLevel, lastTrainedAt: now, nextReviewAt }
        : { nextReviewAt };
      return { id: w.id, data };
    });

    const dryRun = !!opts.dryRun;
    if (!dryRun) {
      for (let i = 0; i < updates.length; i += 100) {
        await prisma.$transaction(
          updates.slice(i, i + 100).map((u) => prisma.word.update({ where: { id: u.id }, data: u.data }))
        );
      }
    }
    return { mode, count: words.length, byDate, mastered, dryRun };
  },

  /**
   * Get today's SRS words globally for a language (using Word table directly)
   */
  async getDailyGlobal(languageId: string, topicIds?: string[], newWordCount?: number, selectionMode?: 'fifo' | 'lifo' | 'random', errorsOnly?: boolean) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // ─── Filters ──────────────────────────────────────────────────────────
    // Reviews are SACRED: what's due today has to appear regardless of which
    // topic the user picked in the pre-start. The topic dropdown only steers
    // which NEW words to introduce. Overdue penalty and forgotten-mastered
    // step must run language-wide too, otherwise words in non-selected topics
    // would rot forever.
    const languageWideFilter: any = errorsOnly
      ? { languageId, name: 'Errores de redacción' }
      : { languageId, name: { not: 'Errores de redacción' } };
    // Topic-scoped filter — only used for new words fetch and the
    // "en curso / pendientes / dominadas" summary tiles.
    const newTopicFilter: any = { ...languageWideFilter };
    if (topicIds && topicIds.length > 0) newTopicFilter.id = { in: topicIds };
    const sourceFilter = errorsOnly ? 'error' : 'vocabulary';

    // Step 1: Detect overdue words — LANGUAGE-WIDE.
    // Overdue items are NOT penalized (user decision 2026-10-11): they stay due with the 'atrasada' label until trained.
    const overdueWords = await prisma.word.findMany({
      where: {
        topic: languageWideFilter,
        source: sourceFilter,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { lt: todayStart },
      },
    });

    // Step 2: Check forgotten mastered words — LANGUAGE-WIDE.
    const language = await prisma.language.findUnique({ where: { id: languageId } });
    const forgetDays = language?.forgetDays || 180;
    const forgetDate = addDays(now, -forgetDays);

    const forgottenWords = await prisma.word.findMany({
      where: {
        topic: languageWideFilter,
        source: sourceFilter,
        srsLevel: MAX_SRS_LEVEL,
        lastTrainedAt: { lt: forgetDate },
      },
    });

    if (forgottenWords.length > 0) {
      await prisma.$transaction(
        forgottenWords.map((w) => prisma.word.update({
          where: { id: w.id },
          data: { srsLevel: 0, lastTrainedAt: null, nextReviewAt: null },
        }))
      );
    }

    // Step 3: Get review words due today — LANGUAGE-WIDE (sagrado).
    const reviewWords = await prisma.word.findMany({
      where: {
        topic: languageWideFilter,
        source: sourceFilter,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { lte: todayEnd },
      },
      orderBy: [{ srsLevel: 'asc' }, { successRate: 'asc' }],
    });

    // Step 4: New words — count is user-configurable, selection mode configurable
    const requestedNewCount = newWordCount ?? getNewWordCount(reviewWords.length);
    const mode = selectionMode || 'fifo';

    let orderBy: any;
    if (mode === 'lifo') {
      orderBy = [{ createdAt: 'desc' as const }];
    } else if (mode === 'random') {
      orderBy = undefined; // will shuffle after fetch
    } else {
      // fifo (default) — oldest first
      orderBy = [{ createdAt: 'asc' as const }];
    }

    // New words — filtered by the selected topic (if any).
    let newWords = await prisma.word.findMany({
      where: {
        topic: newTopicFilter,
        source: sourceFilter,
        srsLevel: 0,
        lastTrainedAt: null,
      },
      orderBy,
      take: mode === 'random' ? undefined : requestedNewCount,
    });

    // For random mode, shuffle and take
    if (mode === 'random') {
      for (let i = newWords.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newWords[i], newWords[j]] = [newWords[j], newWords[i]];
      }
      newWords = newWords.slice(0, requestedNewCount);
    }

    const overdueIds = new Set(overdueWords.map(w => w.id));
    const now2 = new Date();

    let words: any[] = [
      ...reviewWords.map(w => ({
        ...w,
        label: (overdueIds.has(w.id) ? 'atrasada' : 'recordar') as 'atrasada' | 'recordar' | 'nueva',
        daysSinceLastTrained: w.lastTrainedAt ? Math.floor((now2.getTime() - w.lastTrainedAt.getTime()) / (1000 * 60 * 60 * 24)) : null,
      })),
      ...newWords.map(w => ({
        ...w,
        label: 'nueva' as 'atrasada' | 'recordar' | 'nueva',
        daysSinceLastTrained: null as number | null,
      })),
    ];

    // For errors mode, enrich with sentence + blank from Error model
    if (errorsOnly && words.length > 0) {
      const terms = words.map(w => w.term.toLowerCase());
      const errorRecords = await prisma.error.findMany({
        where: {
          correction: { essay: { languageId } },
          corrected: { in: terms, mode: 'insensitive' },
        },
        include: { correction: { include: { essay: { select: { originalText: true } } } } },
      });

      // Group by corrected term (lowercase)
      const errorByTerm = new Map<string, typeof errorRecords[0]>();
      for (const e of errorRecords) {
        const key = e.corrected.toLowerCase();
        if (!errorByTerm.has(key)) errorByTerm.set(key, e);
      }

      words = words.map(w => {
        const err = errorByTerm.get(w.term.toLowerCase());
        if (!err) return w;
        const text = err.correction.essay.originalText;
        const pos = err.position ?? text.toLowerCase().indexOf(err.corrected.toLowerCase());
        let sentenceStart = text.lastIndexOf('.', pos - 1);
        sentenceStart = sentenceStart === -1 ? 0 : sentenceStart + 1;
        let sentenceEnd = text.indexOf('.', pos + err.corrected.length);
        sentenceEnd = sentenceEnd === -1 ? text.length : sentenceEnd + 1;
        const sentence = text.slice(sentenceStart, sentenceEnd).trim();
        const blankSentence = sentence.replace(
          new RegExp(err.corrected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
          '______'
        );
        return { ...w, sentence, blankSentence };
      });
    }

    const reviewByLevel: Record<number, number> = {};
    for (const w of reviewWords) reviewByLevel[w.srsLevel] = (reviewByLevel[w.srsLevel] || 0) + 1;
    const todayByLevel: Record<number, number> = {};
    const overdueByLevel: Record<number, number> = {};
    for (const w of reviewWords) {
      const isOverdue = overdueIds.has(w.id);
      const bucket = isOverdue ? overdueByLevel : todayByLevel;
      bucket[w.srsLevel] = (bucket[w.srsLevel] || 0) + 1;
    }
    const todayCount = reviewWords.filter(w => !overdueIds.has(w.id)).length;

    const totalWords = await prisma.word.count({
      where: { topic: newTopicFilter, source: sourceFilter },
    });
    const mastered = await prisma.word.count({
      where: { topic: newTopicFilter, source: sourceFilter, srsLevel: MAX_SRS_LEVEL },
    });
    const inProgress = await prisma.word.count({
      where: { topic: newTopicFilter, source: sourceFilter, srsLevel: { gt: 0, lt: MAX_SRS_LEVEL } },
    });
    const pending = await prisma.word.count({
      where: { topic: newTopicFilter, source: sourceFilter, srsLevel: 0, lastTrainedAt: null },
    });

    return {
      words,
      summary: {
        reviewCount: reviewWords.length,
        newCount: newWords.length,
        overdueCount: overdueWords.length,
        todayCount,
        todayByLevel,
        overdueByLevel,
        forgottenCount: forgottenWords.length,
        totalCount: words.length,
        reviewByLevel,
        totalInLanguage: totalWords,
        mastered,
        inProgress,
        pending,
      },
    };
  },

  /**
   * Record an attempt (MC or written) without changing SRS level.
   * Updates attempts, correctCount, successRate, weightedScore.
   */
  async recordAttempt(wordId: string, correct: boolean) {
    await wordService.updateStats(wordId, correct);
    return { ok: true };
  },

  /**
   * Advance a word globally (using Word table)
   */
  async advanceWordGlobal(wordId: string) {
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw new Error('Word not found');

    const now = new Date();
    const newLevel = word.srsLevel + 1 >= 5 ? MAX_SRS_LEVEL : word.srsLevel + 1;

    // Stats (attempts/correctCount/weightedScore) are tracked via recordAttempt,
    // not here — so MC/written attempts are counted separately from SRS level changes.

    if (newLevel >= MAX_SRS_LEVEL) {
      return prisma.word.update({
        where: { id: wordId },
        data: { srsLevel: MAX_SRS_LEVEL, lastTrainedAt: now, nextReviewAt: null },
      });
    }

    return prisma.word.update({
      where: { id: wordId },
      data: { srsLevel: newLevel, lastTrainedAt: now, nextReviewAt: scheduleNext(now, SRS_INTERVALS[newLevel] ?? 30) },
    });
  },

  /**
   * Drop a word one level globally
   */
  async resetWordGlobal(wordId: string) {
    const word = await prisma.word.findUnique({ where: { id: wordId } });
    if (!word) throw new Error('Word not found');

    const now = new Date();
    const newLevel = Math.max(word.srsLevel - 1, 1);

    return prisma.word.update({
      where: { id: wordId },
      data: { srsLevel: newLevel, lastTrainedAt: now, nextReviewAt: scheduleNext(now, SRS_INTERVALS[newLevel] ?? 3) },
    });
  },

  /**
   * Create SRS words for a training session (all start at level 0)
   */
  async initSession(sessionId: string, wordIds: string[]) {
    await prisma.trainingSessionSRS.createMany({
      data: wordIds.map((wordId) => ({
        sessionId,
        wordId,
        srsLevel: 0,
        lastTrainedAt: null,
        nextReviewAt: null,
      })),
    });
  },

  /**
   * Get today's words for an SRS session
   */
  async getDailyForSession(sessionId: string) {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Step 1: Penalize overdue words — drop one level
    const overdueWords = await prisma.trainingSessionSRS.findMany({
      where: {
        sessionId,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { lt: todayStart },
      },
    });

    if (overdueWords.length > 0) {
      await prisma.$transaction(
        overdueWords.map((w) => {
          const newLevel = Math.max(w.srsLevel - 1, 1);
          return prisma.trainingSessionSRS.update({
            where: { id: w.id },
            data: { srsLevel: newLevel, nextReviewAt: todayStart },
          });
        })
      );
    }

    // Step 2: Get review words due today
    const reviewSrsWords = await prisma.trainingSessionSRS.findMany({
      where: {
        sessionId,
        srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        nextReviewAt: { lte: todayEnd },
      },
      include: { session: false },
      orderBy: [{ srsLevel: 'asc' }],
    });

    // Step 3: Adaptive new word count
    const newWordCount = getNewWordCount(reviewSrsWords.length);

    // Step 4: Get new words (level 0, never trained)
    const newSrsWords = await prisma.trainingSessionSRS.findMany({
      where: {
        sessionId,
        srsLevel: 0,
        lastTrainedAt: null,
      },
      take: newWordCount,
    });

    // Fetch actual Word data for all
    const allSrsWordIds = [...reviewSrsWords, ...newSrsWords].map((sw) => sw.wordId);
    const words = await prisma.word.findMany({
      where: { id: { in: allSrsWordIds } },
    });
    const wordMap = new Map(words.map((w) => [w.id, w]));

    const now2 = new Date();

    // Build response
    const resultWords = [
      ...reviewSrsWords.map((sw) => {
        const word = wordMap.get(sw.wordId);
        return {
          ...word,
          id: word?.id || sw.wordId,
          srsSessionId: sw.id,
          label: (overdueWords.some((o) => o.id === sw.id) ? 'atrasada' : 'recordar') as 'atrasada' | 'recordar' | 'nueva',
          srsLevel: sw.srsLevel,
          daysSinceLastTrained: sw.lastTrainedAt
            ? Math.floor((now2.getTime() - sw.lastTrainedAt.getTime()) / (1000 * 60 * 60 * 24))
            : null,
        };
      }),
      ...newSrsWords.map((sw) => {
        const word = wordMap.get(sw.wordId);
        return {
          ...word,
          id: word?.id || sw.wordId,
          srsSessionId: sw.id,
          label: 'nueva' as 'atrasada' | 'recordar' | 'nueva',
          srsLevel: 0,
          daysSinceLastTrained: null as number | null,
        };
      }),
    ];

    // Summary
    const reviewByLevel: Record<number, number> = {};
    for (const sw of reviewSrsWords) {
      reviewByLevel[sw.srsLevel] = (reviewByLevel[sw.srsLevel] || 0) + 1;
    }

    // Stats
    const totalInSession = await prisma.trainingSessionSRS.count({ where: { sessionId } });
    const mastered = await prisma.trainingSessionSRS.count({ where: { sessionId, srsLevel: MAX_SRS_LEVEL } });

    return {
      words: resultWords,
      summary: {
        reviewCount: reviewSrsWords.length,
        newCount: newSrsWords.length,
        overdueCount: overdueWords.length,
        totalCount: resultWords.length,
        reviewByLevel,
        totalInSession,
        mastered,
      },
    };
  },

  /**
   * Advance a word in an SRS session after correct written answer
   */
  async advanceWordInSession(srsSessionId: string) {
    const srsWord = await prisma.trainingSessionSRS.findUnique({ where: { id: srsSessionId } });
    if (!srsWord) throw new Error('SRS word not found');

    const now = new Date();
    const newLevel = srsWord.srsLevel + 1 >= 5 ? MAX_SRS_LEVEL : srsWord.srsLevel + 1;

    // Update global word stats
    await wordService.updateStats(srsWord.wordId, true);

    if (newLevel >= MAX_SRS_LEVEL) {
      return prisma.trainingSessionSRS.update({
        where: { id: srsSessionId },
        data: { srsLevel: MAX_SRS_LEVEL, lastTrainedAt: now, nextReviewAt: null },
      });
    }

    const daysUntilNext = SRS_INTERVALS[newLevel] ?? 30;
    return prisma.trainingSessionSRS.update({
      where: { id: srsSessionId },
      data: { srsLevel: newLevel, lastTrainedAt: now, nextReviewAt: scheduleNext(now, daysUntilNext) },
    });
  },

  /**
   * Drop a word one level in an SRS session after incorrect answer
   */
  async resetWordInSession(srsSessionId: string) {
    const srsWord = await prisma.trainingSessionSRS.findUnique({ where: { id: srsSessionId } });
    if (!srsWord) throw new Error('SRS word not found');

    const now = new Date();
    const newLevel = Math.max(srsWord.srsLevel - 1, 1);
    const daysUntilNext = SRS_INTERVALS[newLevel] ?? 3;

    await wordService.updateStats(srsWord.wordId, false);

    return prisma.trainingSessionSRS.update({
      where: { id: srsSessionId },
      data: { srsLevel: newLevel, lastTrainedAt: now, nextReviewAt: scheduleNext(now, daysUntilNext) },
    });
  },

  /**
   * Add extra new words to today's session
   */
  async addExtraWords(sessionId: string, count: number) {
    const extra = await prisma.trainingSessionSRS.findMany({
      where: { sessionId, srsLevel: 0, lastTrainedAt: null },
      take: count,
    });
    const wordIds = extra.map((e) => e.wordId);
    const words = await prisma.word.findMany({ where: { id: { in: wordIds } } });
    const wordMap = new Map(words.map((w) => [w.id, w]));

    return extra.map((sw) => {
      const word = wordMap.get(sw.wordId);
      return {
        ...word,
        id: word?.id || sw.wordId,
        srsSessionId: sw.id,
        label: 'nueva' as const,
        srsLevel: 0,
        daysSinceLastTrained: null,
      };
    });
  },

  /**
   * Get today's word count for a session (for card display)
   */
  async getTodayCount(sessionId: string) {
    const now = new Date();
    const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);

    const due = await prisma.trainingSessionSRS.count({
      where: { sessionId, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    });
    const pending = await prisma.trainingSessionSRS.count({
      where: { sessionId, srsLevel: 0, lastTrainedAt: null },
    });

    let newCount = 0;
    if (due <= 10) newCount = 7;
    else if (due <= 20) newCount = 5;
    else if (due <= 30) newCount = 3;
    newCount = Math.min(newCount, pending);

    return due + newCount;
  },

  /**
   * Init a word into SRS from batch training
   */
  async initFromBatchTraining(wordId: string) {
    const now = new Date();
    return prisma.word.update({
      where: { id: wordId },
      data: {
        srsLevel: 1,
        lastTrainedAt: now,
        nextReviewAt: scheduleNext(now, SRS_INTERVALS[1]),
      },
    });
  },
};
