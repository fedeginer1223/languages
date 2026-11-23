import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } }); if (!l) return;
  const base = { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const, srsLevel: { gt: 0, lt: 6 } };
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const due = await p.word.findMany({ where: { ...base, nextReviewAt: { lte: todayEnd } }, select: { srsLevel: true, nextReviewAt: true, lastTrainedAt: true } });
  console.log(`Para hoy: ${due.length} (de ellas atrasadas: ${due.filter(w => w.nextReviewAt! < todayStart).length})`);
  const byDate = new Map<string, number>(); const byLevel = new Map<number, number>(); const byLast = new Map<string, number>();
  for (const w of due) {
    byDate.set(w.nextReviewAt!.toISOString().slice(0,10), (byDate.get(w.nextReviewAt!.toISOString().slice(0,10))||0)+1);
    byLevel.set(w.srsLevel, (byLevel.get(w.srsLevel)||0)+1);
    const k = w.lastTrainedAt?.toISOString().slice(0,10) ?? 'null'; byLast.set(k, (byLast.get(k)||0)+1);
  }
  console.log('vencimiento:', [...byDate.entries()].sort());
  console.log('nivel:', [...byLevel.entries()].sort());
  console.log('último repaso:', [...byLast.entries()].sort());
  // training activity last 14 days (words whose lastTrainedAt in that window)
  const since = new Date(Date.now() - 14*86400000);
  const trained = await p.word.findMany({ where: { topic: { languageId: l.id }, lastTrainedAt: { gte: since } }, select: { lastTrainedAt: true } });
  const perDay = new Map<string, number>(); for (const w of trained) { const k = w.lastTrainedAt!.toISOString().slice(0,10); perDay.set(k, (perDay.get(k)||0)+1); }
  console.log('palabras repasadas por día (últimos 14):', [...perDay.entries()].sort());
  // upcoming 7 days
  for (let i = 1; i <= 7; i++) { const d = new Date(todayStart); d.setDate(d.getDate()+i); const e = new Date(d); e.setHours(23,59,59,999); const c = await p.word.count({ where: { ...base, nextReviewAt: { gte: d, lte: e } } }); console.log(`  +${i}d ${d.toISOString().slice(0,10)}: ${c}`); }
})().finally(() => p.$disconnect());
