import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const w = await p.word.findFirst({ where: { term: { contains: 'tartiflette', mode: 'insensitive' } }, include: { topic: true } });
  if (!w) { console.log('no word'); return; }
  const now = new Date();
  const d = (x: Date | null) => x ? Math.floor((now.getTime() - x.getTime()) / 86400000) : null;
  console.log({ term: w.term, def: w.definition, topic: w.topic.name, srsLevel: w.srsLevel, attempts: w.attempts, correct: w.correctCount,
    lastTrainedAt: w.lastTrainedAt?.toISOString().slice(0,10), daysSinceTrained: d(w.lastTrainedAt),
    nextReviewAt: w.nextReviewAt?.toISOString().slice(0,10), daysOverdue: d(w.nextReviewAt), recent: w.recentResults.slice(-10) });
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const base = { topic: { languageId: l!.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const, srsLevel: { gt: 0, lt: 6 } };
  const due = await p.word.count({ where: { ...base, nextReviewAt: { lte: todayEnd } } });
  const overdue = await p.word.count({ where: { ...base, nextReviewAt: { lt: todayStart } } });
  const trainedLast7 = await p.word.groupBy({ by: ['lastTrainedAt'], where: { topic: { languageId: l!.id }, lastTrainedAt: { gte: new Date(now.getTime() - 8*86400000) } }, _count: true });
  const perDay = new Map<string, number>(); for (const g of trainedLast7) { const k = g.lastTrainedAt!.toISOString().slice(0,10); perDay.set(k, (perDay.get(k)||0) + g._count); }
  console.log({ dueToday: due, overdue, trainedPerDayLast8: Object.fromEntries([...perDay.entries()].sort()) });
})().finally(() => p.$disconnect());
