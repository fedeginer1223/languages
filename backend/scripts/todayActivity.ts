import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const touchedToday = await p.word.findMany({
    where: { topic: { languageId: l.id }, updatedAt: { gte: today, lte: todayEnd } },
    orderBy: { updatedAt: 'desc' },
    include: { topic: true },
    take: 30,
  });
  console.log(`Palabras tocadas HOY (${today.toISOString().slice(0,10)}): ${touchedToday.length}\n`);
  for (const w of touchedToday) {
    console.log(`  ${w.term.padEnd(30)} lvl=${w.srsLevel} last=${w.lastTrainedAt?.toISOString()} next=${w.nextReviewAt?.toISOString()} topic=${w.topic.name}`);
  }
  console.log(`\nServer time now: ${new Date().toString()}`);
})().finally(() => p.$disconnect());
