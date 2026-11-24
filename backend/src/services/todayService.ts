import { prisma } from '../utils/prisma';
import { addDays } from '../utils/srsSchedule';
import { composeSession, DEFAULT_SESSION_SIZE } from '../utils/sessionComposer';
import { srsBacklogService } from './srsBacklogService';
import type { TodayResponse, TodayModuleStats } from '../types';

const MAX_SRS_LEVEL = 6;
const STREAK_WINDOW_DAYS = 90;

function startOfDay(d: Date): Date { const r = new Date(d); r.setHours(0, 0, 0, 0); return r; }
function endOfDay(d: Date): Date { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function compose(dueToday: number, newAvailable: number, sessionSize: number) {
  const c = composeSession({
    reviews: Array.from({ length: dueToday }, (_, i) => i),
    newItems: Array.from({ length: newAvailable }, (_, i) => i),
    sessionSize,
  });
  return { reviewsInSession: c.reviews.length, newInSession: c.newItems.length, remainingReviews: c.remainingReviews };
}

/**
 * Read-only "Hoy" summary. Deliberately does NOT call the session builders
 * (they demote forgotten-mastered items and rebalance the backlog).
 */
export const todayService = {
  async getToday(languageId: string, rawSessionSize?: number): Promise<TodayResponse> {
    const sessionSize = rawSessionSize === undefined || !Number.isFinite(rawSessionSize)
      ? DEFAULT_SESSION_SIZE
      : Math.min(60, Math.max(10, Math.round(rawSessionSize)));

    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const tomorrowStart = addDays(now, 1);
    const tomorrowEnd = endOfDay(tomorrowStart);
    const streakFrom = addDays(now, -STREAK_WINDOW_DAYS);

    const wordBase = {
      topic: { languageId, name: { not: 'Errores de redacción' } },
      source: 'vocabulary',
    };
    const inProg = { gt: 0, lt: MAX_SRS_LEVEL };
    const trainable = { examples: { some: { AND: [{ spanish: { not: null } }, { spanish: { not: '' } }] } } };

    const [
      vDue, vOverdue, vNew, vTomorrow, vMastered, vInProgress, vTotal,
      sDue, sOverdue, sNew, sTomorrow, sMastered, sInProgress, sTotal,
      verbs, backlog, wordDays, structDays, verbDays,
    ] = await Promise.all([
      prisma.word.count({ where: { ...wordBase, srsLevel: inProg, nextReviewAt: { lte: todayEnd } } }),
      prisma.word.count({ where: { ...wordBase, srsLevel: inProg, nextReviewAt: { lt: todayStart } } }),
      prisma.word.count({ where: { ...wordBase, srsLevel: 0, lastTrainedAt: null } }),
      prisma.word.count({ where: { ...wordBase, srsLevel: inProg, nextReviewAt: { gte: tomorrowStart, lte: tomorrowEnd } } }),
      prisma.word.count({ where: { ...wordBase, srsLevel: MAX_SRS_LEVEL } }),
      prisma.word.count({ where: { ...wordBase, srsLevel: inProg } }),
      prisma.word.count({ where: wordBase }),

      prisma.structure.count({ where: { languageId, srsLevel: inProg, nextReviewAt: { lte: todayEnd }, ...trainable } }),
      prisma.structure.count({ where: { languageId, srsLevel: inProg, nextReviewAt: { lt: todayStart }, ...trainable } }),
      prisma.structure.count({ where: { languageId, srsLevel: 0, lastTrainedAt: null } }),
      prisma.structure.count({ where: { languageId, srsLevel: inProg, nextReviewAt: { gte: tomorrowStart, lte: tomorrowEnd }, ...trainable } }),
      prisma.structure.count({ where: { languageId, srsLevel: MAX_SRS_LEVEL } }),
      prisma.structure.count({ where: { languageId, srsLevel: inProg } }),
      prisma.structure.count({ where: { languageId } }),

      prisma.verb.findMany({
        where: { languageId },
        select: { id: true, conjugations: { select: { attempts: true, srsLevel: true, nextReviewAt: true } } },
      }),
      srsBacklogService.getBacklog(languageId, 7),

      prisma.word.findMany({ where: { topic: { languageId }, lastTrainedAt: { gte: streakFrom } }, select: { lastTrainedAt: true } }),
      prisma.structure.findMany({ where: { languageId, lastTrainedAt: { gte: streakFrom } }, select: { lastTrainedAt: true } }),
      prisma.verbConjugation.findMany({ where: { verb: { languageId }, lastTrainedAt: { gte: streakFrom } }, select: { lastTrainedAt: true } }),
    ]);

    const mod = (dueToday: number, overdue: number, newAvailable: number, tomorrow: number,
      mastered: number, inProgress: number, total: number): TodayModuleStats => ({
      dueToday, overdue, newAvailable, ...compose(dueToday, newAvailable, sessionSize),
      tomorrow, mastered, inProgress, total,
    });

    // Verbs
    let verbsDue = 0, verbsNeverTrained = 0, conjugationsDue = 0, tomorrowVerbs = 0;
    for (const v of verbs) {
      const due = v.conjugations.filter((c) =>
        c.srsLevel > 0 && c.srsLevel < MAX_SRS_LEVEL && c.nextReviewAt && c.nextReviewAt <= todayEnd).length;
      conjugationsDue += due;
      if (due > 0) verbsDue++;
      if (v.conjugations.some((c) =>
        c.srsLevel > 0 && c.srsLevel < MAX_SRS_LEVEL && c.nextReviewAt && c.nextReviewAt >= tomorrowStart && c.nextReviewAt <= tomorrowEnd)) tomorrowVerbs++;
      if (v.conjugations.length > 0 && v.conjugations.every((c) => (c.attempts ?? 0) === 0)) verbsNeverTrained++;
    }

    // Streak
    const days = new Set<string>();
    for (const r of [...wordDays, ...structDays, ...verbDays]) if (r.lastTrainedAt) days.add(dayKey(r.lastTrainedAt));
    const trainedToday = days.has(dayKey(now));
    let streak = 0;
    let cursor = trainedToday ? startOfDay(now) : addDays(now, -1);
    while (days.has(dayKey(cursor))) { streak++; cursor = addDays(cursor, -1); }
    const lastMs = Math.max(0, ...[...wordDays, ...structDays, ...verbDays].map((r) => r.lastTrainedAt!.getTime()));

    const week: TodayResponse['week'] = {};
    for (const k of Object.keys(backlog.vocab.next)) {
      week[k] = { vocabulary: backlog.vocab.next[k] ?? 0, structures: backlog.structures.next[k] ?? 0 };
    }

    return {
      date: dayKey(now),
      sessionSize,
      modules: {
        vocabulary: mod(vDue, vOverdue, vNew, vTomorrow, vMastered, vInProgress, vTotal),
        structures: mod(sDue, sOverdue, sNew, sTomorrow, sMastered, sInProgress, sTotal),
        verbs: { verbsDue, verbsNeverTrained, conjugationsDue, tomorrowVerbs, totalVerbs: verbs.length },
      },
      streak: { days: streak, trainedToday, lastTrainedAt: lastMs > 0 ? new Date(lastMs).toISOString() : null },
      week,
    };
  },
};
