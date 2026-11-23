import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const now = new Date();
  const lang = await p.language.findFirst({ where: { name: 'Français' } });
  if (!lang) return;

  // Group by nextReviewAt to see the schedule
  const items = await p.word.findMany({
    where: { topic: { languageId: lang.id }, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 } },
    select: { nextReviewAt: true },
  });
  const byDate = new Map<string, number>();
  for (const w of items) {
    if (!w.nextReviewAt) continue;
    const key = w.nextReviewAt.toISOString().slice(0, 10);
    byDate.set(key, (byDate.get(key) ?? 0) + 1);
  }
  console.log(`Vocab schedule (Français), now = ${now.toISOString()}:`);
  for (const [d, c] of [...byDate.entries()].sort()) {
    console.log(`  ${d}: ${c} palabras`);
  }

  const verbs = await p.verbConjugation.findMany({
    where: { verb: { languageId: lang.id }, srsLevel: { gt: 0, lt: 6 } },
    select: { nextReviewAt: true },
  });
  const vByDate = new Map<string, number>();
  for (const v of verbs) {
    if (!v.nextReviewAt) continue;
    const key = v.nextReviewAt.toISOString().slice(0, 10);
    vByDate.set(key, (vByDate.get(key) ?? 0) + 1);
  }
  console.log(`\nVerb conjugations schedule:`);
  for (const [d, c] of [...vByDate.entries()].sort()) {
    console.log(`  ${d}: ${c} conjugaciones`);
  }

  await p.$disconnect();
})();
