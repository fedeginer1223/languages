import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const now = new Date();
  const rows = await p.verbConjugation.findMany({
    where: { verb: { language: { name: 'Français' } }, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    include: { verb: true },
    orderBy: { nextReviewAt: 'asc' },
  });
  console.log(`Due-today conjugations for Français: ${rows.length}`);
  for (const c of rows.slice(0, 20)) {
    const daysAgo = c.nextReviewAt ? Math.floor((now.getTime() - c.nextReviewAt.getTime()) / (1000*60*60*24)) : null;
    console.log(`  ${c.verb.infinitive} · ${c.tense} · ${c.person} · lvl=${c.srsLevel} · next=${c.nextReviewAt?.toISOString().slice(0,10)} (${daysAgo}d ago)`);
  }
  await p.$disconnect();
})();
