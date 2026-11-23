import { scheduleNext } from '../utils/srsSchedule';
import { prisma } from '../utils/prisma';
import { calculateWeightedScore } from '../utils/validation';

const SRS_INTERVALS: Record<number, number> = { 0: 0, 1: 3, 2: 7, 3: 15, 4: 30 };
const MAX_SRS_LEVEL = 6;

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  r.setHours(0, 0, 0, 0);
  return r;
}
function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d: Date): Date { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Dictation SRS — mirrors the vocabulary SRS engine but on a separate set of
 * `dictation*` columns on Word, so hearing-recognition mastery is tracked
 * independently from reading-recognition mastery.
 */
function safeRegex(source: string | undefined): RegExp | null {
  if (!source) return null;
  try {
    // Case-insensitive, Unicode-aware. Length cap prevents pathological patterns.
    if (source.length > 200) return null;
    return new RegExp(source, 'iu');
  } catch {
    return null;
  }
}

export const dictationService = {
  async getDaily(
    languageId: string,
    topicIds?: string[],
    newWordCount: number = 7,
    selectionMode: 'fifo' | 'lifo' | 'random' = 'random',
    characterFilter?: string,
  ) {
    const filterRe = safeRegex(characterFilter);
    const matches = (term: string) => (filterRe ? filterRe.test(term) : true);
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    // Reviews are SACRED at the language level: switching topic in the
    // pre-start must not shrink the "Recordar" pool. Topic filter only
    // steers which NEW words to introduce.
    const languageWideFilter: any = { languageId, name: { not: 'Errores de redacción' } };
    const newTopicFilter: any = { ...languageWideFilter };
    if (topicIds && topicIds.length > 0) newTopicFilter.id = { in: topicIds };
    const sourceFilter = 'vocabulary';

    // Overdue items are NOT penalized (user decision 2026-10-11): they stay due with the 'atrasada' label until trained.
    const overdue = await prisma.word.findMany({
      where: {
        topic: languageWideFilter,
        source: sourceFilter,
        dictationSrsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        dictationNextReviewAt: { lt: todayStart },
      },
    });

    // 2. Forgotten mastered
    const language = await prisma.language.findUnique({ where: { id: languageId } });
    const forgetDays = language?.forgetDays || 180;
    const forgetCutoff = addDays(now, -forgetDays);
    const forgotten = await prisma.word.findMany({
      where: {
        topic: languageWideFilter,
        source: sourceFilter,
        dictationSrsLevel: MAX_SRS_LEVEL,
        dictationLastTrainedAt: { lt: forgetCutoff },
      },
    });
    if (forgotten.length > 0) {
      await prisma.$transaction(forgotten.map((w) =>
        prisma.word.update({ where: { id: w.id }, data: { dictationSrsLevel: 0, dictationLastTrainedAt: null, dictationNextReviewAt: null } })
      ));
    }

    // 3. Review-due — LANGUAGE-WIDE (sagrado). Phonetic filter still applies.
    const reviewWordsAll = await prisma.word.findMany({
      where: {
        topic: languageWideFilter,
        source: sourceFilter,
        dictationSrsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
        dictationNextReviewAt: { lte: todayEnd },
      },
      orderBy: [{ dictationSrsLevel: 'asc' }],
    });
    const reviewWords = reviewWordsAll.filter((w) => matches(w.term));

    // 4. New words — filter by pattern, THEN sample newWordCount
    const orderBy: any =
      selectionMode === 'lifo' ? [{ createdAt: 'desc' as const }] :
      selectionMode === 'random' ? undefined :
      [{ createdAt: 'asc' as const }];

    // With a filter, we need the full pool to filter → then sample. Without
    // filter, we can `take` on the DB side for non-random modes.
    // New words — topic-scoped (the selector's purpose).
    let newAvailable = await prisma.word.findMany({
      where: {
        topic: newTopicFilter,
        source: sourceFilter,
        dictationSrsLevel: 0,
        dictationLastTrainedAt: null,
      },
      orderBy,
      take: (selectionMode === 'random' || filterRe) ? undefined : newWordCount,
    });
    if (filterRe) newAvailable = newAvailable.filter((w) => matches(w.term));
    let newWords = selectionMode === 'random' ? shuffle(newAvailable).slice(0, newWordCount) : newAvailable.slice(0, newWordCount);

    const overdueIds = new Set(overdue.map((w) => w.id));

    const results = [
      ...reviewWords.map((w) => ({
        ...w,
        label: (overdueIds.has(w.id) ? 'atrasada' : 'recordar') as 'atrasada' | 'recordar' | 'nueva',
        srsLevel: w.dictationSrsLevel,
        daysSinceLastTrained: w.dictationLastTrainedAt
          ? Math.floor((now.getTime() - w.dictationLastTrainedAt.getTime()) / (1000 * 60 * 60 * 24))
          : null,
      })),
      ...newWords.map((w) => ({
        ...w,
        label: 'nueva' as 'atrasada' | 'recordar' | 'nueva',
        srsLevel: 0,
        daysSinceLastTrained: null as number | null,
      })),
    ];

    // Session-wide stats — reflect the filtered pool so the pre-start summary
    // matches what the session will actually contain.
    let totalInLanguage: number;
    let mastered: number;
    let inProgress: number;
    let pending: number;

    if (filterRe) {
      // In-memory count over the filtered set — fine because dictation pool
      // per language stays in the low thousands at most.
      const all = await prisma.word.findMany({
        where: { topic: newTopicFilter, source: sourceFilter },
        select: { term: true, dictationSrsLevel: true, dictationLastTrainedAt: true },
      });
      const filtered = all.filter((w) => matches(w.term));
      totalInLanguage = filtered.length;
      mastered = filtered.filter((w) => w.dictationSrsLevel === MAX_SRS_LEVEL).length;
      inProgress = filtered.filter((w) => w.dictationSrsLevel > 0 && w.dictationSrsLevel < MAX_SRS_LEVEL).length;
      pending = filtered.filter((w) => w.dictationSrsLevel === 0 && !w.dictationLastTrainedAt).length;
    } else {
      totalInLanguage = await prisma.word.count({ where: { topic: newTopicFilter, source: sourceFilter } });
      mastered = await prisma.word.count({
        where: { topic: newTopicFilter, source: sourceFilter, dictationSrsLevel: MAX_SRS_LEVEL },
      });
      inProgress = await prisma.word.count({
        where: { topic: newTopicFilter, source: sourceFilter, dictationSrsLevel: { gt: 0, lt: MAX_SRS_LEVEL } },
      });
      pending = await prisma.word.count({
        where: { topic: newTopicFilter, source: sourceFilter, dictationSrsLevel: 0, dictationLastTrainedAt: null },
      });
    }

    const reviewByLevel: Record<number, number> = {};
    for (const w of reviewWords) reviewByLevel[w.dictationSrsLevel] = (reviewByLevel[w.dictationSrsLevel] || 0) + 1;

    return {
      words: results,
      summary: {
        reviewCount: reviewWords.length,
        newCount: newWords.length,
        overdueCount: overdue.length,
        forgottenCount: forgotten.length,
        totalCount: results.length,
        reviewByLevel,
        totalInLanguage,
        mastered,
        inProgress,
        pending,
      },
    };
  },

  async recordAttempt(wordId: string, correct: boolean) {
    const w = await prisma.word.findUnique({ where: { id: wordId } });
    if (!w) throw new Error('Word not found');
    const recent = (w.dictationRecentResults + (correct ? '1' : '0')).slice(-30);
    const weightedScore = calculateWeightedScore(recent);
    const attempts = w.dictationAttempts + 1;
    const correctCount = w.dictationCorrectCount + (correct ? 1 : 0);
    await prisma.word.update({
      where: { id: wordId },
      data: {
        dictationAttempts: attempts,
        dictationCorrectCount: correctCount,
        dictationRecentResults: recent,
        dictationWeightedScore: weightedScore,
      },
    });
    return { ok: true };
  },

  async advanceWord(wordId: string) {
    const w = await prisma.word.findUnique({ where: { id: wordId } });
    if (!w) throw new Error('Word not found');
    const now = new Date();
    const newLevel = w.dictationSrsLevel + 1 >= 5 ? MAX_SRS_LEVEL : w.dictationSrsLevel + 1;
    if (newLevel >= MAX_SRS_LEVEL) {
      return prisma.word.update({
        where: { id: wordId },
        data: { dictationSrsLevel: MAX_SRS_LEVEL, dictationLastTrainedAt: now, dictationNextReviewAt: null },
      });
    }
    return prisma.word.update({
      where: { id: wordId },
      data: {
        dictationSrsLevel: newLevel,
        dictationLastTrainedAt: now,
        dictationNextReviewAt: scheduleNext(now, SRS_INTERVALS[newLevel] ?? 30),
      },
    });
  },

  async resetWord(wordId: string) {
    const w = await prisma.word.findUnique({ where: { id: wordId } });
    if (!w) throw new Error('Word not found');
    const now = new Date();
    const newLevel = Math.max(w.dictationSrsLevel - 1, 1);
    return prisma.word.update({
      where: { id: wordId },
      data: {
        dictationSrsLevel: newLevel,
        dictationLastTrainedAt: now,
        dictationNextReviewAt: scheduleNext(now, SRS_INTERVALS[newLevel] ?? 3),
      },
    });
  },
};
