import { prisma } from '../src/utils/prisma';

const midnight = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

async function main() {
  const today = midnight(new Date());
  // Restored rows carry lastTrainedAt exactly at local midnight 2026-10-11 (= 2026-10-10T22:00Z in CEST),
  // so match that exact instant (real trainings that day have non-midnight timestamps).
  const dayStart = new Date(2026, 9, 11, 0, 0, 0, 0);
  const dayEnd = new Date(2026, 9, 11, 0, 0, 0, 1);

  const words = await prisma.word.findMany({
    where: {
      source: 'vocabulary',
      topic: { language: { name: 'Français' } },
      srsLevel: { gte: 1, lte: 5 },
      nextReviewAt: { lt: today },
      lastTrainedAt: { gte: dayStart, lt: dayEnd },
    },
    select: { id: true, term: true, srsLevel: true },
  });

  const hist: Record<number, number> = {};
  for (const w of words) hist[w.srsLevel] = (hist[w.srsLevel] || 0) + 1;
  console.log(`Matched: ${words.length}`);
  console.log('Level histogram:', hist);
  if (words.length < 150 || words.length > 300) {
    console.log('unexpected count, aborting');
    return;
  }

  words.sort((a, b) => b.srsLevel - a.srsLevel || a.term.localeCompare(b.term));
  const assignments = words.map((w, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + 1 + (i % 10));
    d.setHours(0, 0, 0, 0);
    return { id: w.id, nextReviewAt: d };
  });

  let updated = 0;
  for (let i = 0; i < assignments.length; i += 100) {
    const chunk = assignments.slice(i, i + 100);
    await prisma.$transaction(
      chunk.map(a => prisma.word.update({ where: { id: a.id }, data: { nextReviewAt: a.nextReviewAt } }))
    );
    updated += chunk.length;
  }

  const perDay: Record<string, number> = {};
  for (const a of assignments) perDay[fmt(a.nextReviewAt)] = (perDay[fmt(a.nextReviewAt)] || 0) + 1;
  console.log('Per-day counts:', perDay);
  console.log(`Total updated: ${updated}`);

  const endToday = new Date(today); endToday.setHours(23, 59, 59, 999);
  const due = await prisma.word.count({
    where: {
      source: 'vocabulary',
      topic: { language: { name: 'Français' } },
      srsLevel: { gte: 1, lte: 5 },
      nextReviewAt: { lte: endToday },
    },
  });
  console.log(`Due today (Français vocab, L1-5): ${due}`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
