import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const now = new Date();
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const due = await p.word.findMany({
    where: { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary',
      srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } },
    orderBy: [{ nextReviewAt: 'asc' }],
    include: { topic: true },
  });
  console.log(`Due today language-wide: ${due.length}\n`);
  for (const w of due) {
    const nextIso = w.nextReviewAt?.toISOString();
    const nextLocal = w.nextReviewAt?.toString();
    console.log(`  ${w.term.padEnd(32)} lvl=${w.srsLevel} attempts=${w.attempts}/${w.correctCount} topic=${w.topic.name}`);
    console.log(`     last=${w.lastTrainedAt?.toISOString()}  next=${nextIso}  (${nextLocal?.slice(0,25)})`);
  }
  await p.$disconnect();
})();
