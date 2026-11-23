import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const now = new Date();
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const langs = await p.language.findMany();
  for (const l of langs) {
    console.log(`\n=== ${l.name} ===`);

    // Vocabulary
    const vocabDue = await p.word.count({
      where: { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary',
        srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    });
    const vocabInProgress = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 } },
    });
    console.log(`Vocab: due=${vocabDue} inProgress=${vocabInProgress}`);
    if (vocabInProgress > 0) {
      const upcoming = await p.word.findMany({
        where: { topic: { languageId: l.id }, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 } },
        orderBy: [{ nextReviewAt: 'asc' }],
        select: { term: true, srsLevel: true, lastTrainedAt: true, nextReviewAt: true },
        take: 8,
      });
      for (const w of upcoming) {
        const days = w.nextReviewAt ? Math.round((w.nextReviewAt.getTime() - now.getTime()) / (1000*60*60*24)) : null;
        console.log(`   ${w.term} lvl=${w.srsLevel} next=${w.nextReviewAt?.toISOString().slice(0,10)} (${days}d)`);
      }
    }

    // Dictation
    const dictDue = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary',
        dictationSrsLevel: { gt: 0, lt: 6 }, dictationNextReviewAt: { lte: todayEnd } },
    });
    const dictInProg = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 } },
    });
    console.log(`Dict:  due=${dictDue} inProgress=${dictInProg}`);
    if (dictInProg > 0) {
      const upcoming = await p.word.findMany({
        where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 } },
        orderBy: [{ dictationNextReviewAt: 'asc' }],
        select: { term: true, dictationSrsLevel: true, dictationNextReviewAt: true },
        take: 8,
      });
      for (const w of upcoming) {
        const days = w.dictationNextReviewAt ? Math.round((w.dictationNextReviewAt.getTime() - now.getTime()) / (1000*60*60*24)) : null;
        console.log(`   ${w.term} lvl=${w.dictationSrsLevel} next=${w.dictationNextReviewAt?.toISOString().slice(0,10)} (${days}d)`);
      }
    }

    // Structures
    const structDue = await p.structure.count({
      where: { languageId: l.id, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    });
    const structInProg = await p.structure.count({
      where: { languageId: l.id, srsLevel: { gt: 0, lt: 6 } },
    });
    console.log(`Struct: due=${structDue} inProgress=${structInProg}`);

    // Verbs
    const verbsDue = await p.verbConjugation.count({
      where: { verb: { languageId: l.id }, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    });
    const verbsInProg = await p.verbConjugation.count({
      where: { verb: { languageId: l.id }, srsLevel: { gt: 0, lt: 6 } },
    });
    console.log(`Verbs:  due=${verbsDue} inProgress=${verbsInProg}`);
    if (verbsInProg > 0) {
      const upcoming = await p.verbConjugation.findMany({
        where: { verb: { languageId: l.id }, srsLevel: { gt: 0, lt: 6 } },
        include: { verb: true },
        orderBy: [{ nextReviewAt: 'asc' }],
        take: 6,
      });
      for (const c of upcoming) {
        const days = c.nextReviewAt ? Math.round((c.nextReviewAt.getTime() - now.getTime()) / (1000*60*60*24)) : null;
        console.log(`   ${c.verb.infinitive} ${c.tense} ${c.person} lvl=${c.srsLevel} next=${c.nextReviewAt?.toISOString().slice(0,10)} (${days}d)`);
      }
    }
  }
  await p.$disconnect();
})();
