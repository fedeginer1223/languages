import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const langs = await p.language.findMany();
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  for (const l of langs) {
    const structsDueAll = await p.structure.count({
      where: { languageId: l.id, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    });
    const structsDueTrainable = await p.structure.count({
      where: {
        languageId: l.id, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd },
        examples: { some: { AND: [{ spanish: { not: null } }, { spanish: { not: '' } }] } },
      },
    });
    const dueVerb = await p.verbConjugation.findFirst({
      where: { verb: { languageId: l.id }, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
      select: { id: true },
    });
    const newVerb = await p.verbConjugation.findFirst({
      where: { verb: { languageId: l.id }, srsLevel: 0, lastTrainedAt: null },
      select: { id: true },
    });
    console.log(`${l.name}: structs due all=${structsDueAll} trainable=${structsDueTrainable} | verbs OLD=${dueVerb||newVerb?1:0} NEW=${dueVerb?1:0}`);
  }
  await p.$disconnect();
})();
