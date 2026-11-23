import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const totalDue = await p.word.count({
    where: { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
  });
  console.log(`Total due language-wide: ${totalDue}`);
  const topics = await p.topic.findMany({ where: { languageId: l.id } });
  for (const t of topics) {
    const due = await p.word.count({
      where: { topicId: t.id, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    });
    if (due > 0) console.log(`  ${t.name}: ${due} due`);
  }
  await p.$disconnect();
})();
