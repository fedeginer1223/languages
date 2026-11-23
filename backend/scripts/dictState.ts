import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const langs = await p.language.findMany();
  for (const l of langs) {
    const inProgress = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 } },
    });
    const mastered = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: 6 },
    });
    const dueToday = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 }, dictationNextReviewAt: { lte: todayEnd } },
    });
    const scheduled = await p.word.count({
      where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 }, dictationNextReviewAt: { not: null } },
    });
    console.log(`${l.name}: inProgress=${inProgress} mastered=${mastered} dueToday=${dueToday} scheduled=${scheduled}`);
    // Sample first 5 in-progress
    const sample = await p.word.findMany({
      where: { topic: { languageId: l.id }, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 } },
      select: { term: true, dictationSrsLevel: true, dictationLastTrainedAt: true, dictationNextReviewAt: true },
      take: 5,
    });
    for (const w of sample) {
      console.log(`  ${w.term} lvl=${w.dictationSrsLevel} last=${w.dictationLastTrainedAt?.toISOString().slice(0,10)} next=${w.dictationNextReviewAt?.toISOString().slice(0,10)}`);
    }
  }
  await p.$disconnect();
})();
