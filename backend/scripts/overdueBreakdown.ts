import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const base = { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const };
  const todayStart = new Date(); todayStart.setHours(0,0,0,0);
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  const due = await p.word.findMany({ where: { ...base, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } }, select: { srsLevel: true, nextReviewAt: true, lastTrainedAt: true } });
  const overdue = due.filter((w) => w.nextReviewAt! < todayStart);
  console.log(`Due hoy (incl. atrasadas): ${due.length} · atrasadas (antes de hoy): ${overdue.length}`);
  const byDate = new Map<string, number>(); const byLevel = new Map<number, number>();
  for (const w of due) { const k = w.nextReviewAt!.toISOString().slice(0,10); byDate.set(k, (byDate.get(k)||0)+1); byLevel.set(w.srsLevel, (byLevel.get(w.srsLevel)||0)+1); }
  console.log('por fecha de vencimiento:', [...byDate.entries()].sort());
  console.log('por nivel:', [...byLevel.entries()].sort());
  const lastByDate = new Map<string, number>();
  for (const w of due) { const k = w.lastTrainedAt ? w.lastTrainedAt.toISOString().slice(0,10) : 'null'; lastByDate.set(k, (lastByDate.get(k)||0)+1); }
  console.log('por última vez entrenadas:', [...lastByDate.entries()].sort());
})().finally(() => p.$disconnect());
