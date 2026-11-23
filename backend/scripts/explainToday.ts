import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } }); if (!l) return;
  const base = { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const };
  const ts = new Date(); ts.setHours(0,0,0,0); const te = new Date(); te.setHours(23,59,59,999);
  const today = await p.word.findMany({ where: { ...base, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { gte: ts, lte: te } }, select: { term: true, srsLevel: true, lastTrainedAt: true, nextReviewAt: true, topic: { select: { name: true } } } });
  console.log(`Vencen HOY: ${today.length}`);
  const byLevel = new Map<number, number>(); const byLast = new Map<string, number>(); const byTopic = new Map<string, number>();
  for (const w of today) { byLevel.set(w.srsLevel, (byLevel.get(w.srsLevel)||0)+1); const k = w.lastTrainedAt ? w.lastTrainedAt.toISOString().slice(0,16) : 'null'; byLast.set(k, (byLast.get(k)||0)+1); byTopic.set(w.topic.name, (byTopic.get(w.topic.name)||0)+1); }
  console.log('por nivel:', [...byLevel.entries()].sort());
  console.log('por lastTrainedAt:', [...byLast.entries()].sort());
  console.log('por topic:', [...byTopic.entries()]);
  console.log('muestra:', today.slice(0,8).map(w => `${w.term} L${w.srsLevel} last=${w.lastTrainedAt?.toISOString().slice(0,10)}`).join(' | '));
  const overdue = await p.word.count({ where: { ...base, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lt: ts } } });
  console.log(`Atrasadas ahora: ${overdue}`);
})().finally(() => p.$disconnect());
