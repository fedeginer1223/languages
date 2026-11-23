import { prisma } from '../utils/prisma';

const MAX_SRS_LEVEL = 6;

function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Read-only counts of what's due today per section. No side effects —
 * safe to call on every sidebar render / poll.
 *
 * "Due today" = reviews strictly scheduled for today (or overdue).
 * New/pending items are user-paced (not homework), so they don't count.
 * Once the user finishes today's reviews, the badge drops to 0.
 */
export const dueCountsService = {
  async getForLanguage(languageId: string) {
    const todayEnd = endOfDay(new Date());

    const [vocabulary, verbs, structures, dictation] = await Promise.all([
      prisma.word.count({
        where: {
          topic: { languageId, name: { not: 'Errores de redacción' } },
          source: 'vocabulary',
          srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
          nextReviewAt: { lte: todayEnd },
        },
      }),
      // Verbs: badge = number of distinct VERBS with at least one conjugation
      // scheduled for today. This maps cleanly to the training UX — you train
      // one verb per session — so the badge decrements as you clear each verb.
      (async () => {
        const dueConjugations = await prisma.verbConjugation.findMany({
          where: {
            verb: { languageId },
            srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
            nextReviewAt: { lte: todayEnd },
          },
          select: { verbId: true },
        });
        return new Set(dueConjugations.map((c) => c.verbId)).size;
      })(),
      // Structures: only count structures that are actually TRAINABLE (have at
      // least one example with a Spanish prompt). Untrainable structures were
      // silently filtered out of the training session — counting them here left
      // the badge permanently lit.
      prisma.structure.count({
        where: {
          languageId,
          srsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
          nextReviewAt: { lte: todayEnd },
          // Match the frontend session filter: (spanish ?? '').trim().length > 0.
          // Approximated at the DB level as: not null AND not empty string.
          examples: { some: { AND: [{ spanish: { not: null } }, { spanish: { not: '' } }] } },
        },
      }),
      prisma.word.count({
        where: {
          topic: { languageId, name: { not: 'Errores de redacción' } },
          source: 'vocabulary',
          dictationSrsLevel: { gt: 0, lt: MAX_SRS_LEVEL },
          dictationNextReviewAt: { lte: todayEnd },
        },
      }),
    ]);

    return { vocabulary, verbs, structures, dictation };
  },
};
