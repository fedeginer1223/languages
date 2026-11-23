import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const t = await p.topic.findFirst({ where: { name: 'Restaurante' } });
  if (!t) return console.log('no topic');
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const total = await p.word.count({ where: { topicId: t.id, source: 'vocabulary' } });
  const pending = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: 0, lastTrainedAt: null } });
  const inProgress = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 } } });
  const dueToday = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } } });
  const overdue = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lt: todayStart } } });
  console.log(`Restaurante: total=${total} pending=${pending} inProgress=${inProgress} dueToday=${dueToday} overdue=${overdue}`);
  // Levels distribution
  for (let lvl = 0; lvl <= 6; lvl++) {
    const c = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: lvl } });
    console.log(`  level ${lvl}: ${c}`);
  }
  // In-progress ones with their next review dates
  const items = await p.word.findMany({
    where: { topicId: t.id, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 } },
    orderBy: [{ nextReviewAt: 'asc' }],
    select: { term: true, srsLevel: true, lastTrainedAt: true, nextReviewAt: true, attempts: true, correctCount: true },
  });
  console.log(`--- in-progress words (${items.length}):`);
  for (const w of items) {
    console.log(`  ${w.term} · lvl=${w.srsLevel} · last=${w.lastTrainedAt?.toISOString().slice(0,10)} · next=${w.nextReviewAt?.toISOString().slice(0,10)} · att=${w.attempts}/${w.correctCount}`);
  }
  await p.$disconnect();
})();
