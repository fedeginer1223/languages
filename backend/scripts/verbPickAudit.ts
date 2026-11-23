import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const verbs = await p.verb.findMany({ where: { languageId: l.id }, include: { conjugations: true } });
  const now = Date.now();
  const rows = verbs.map((v) => {
    const total = v.conjugations.length;
    const mastered = v.conjugations.filter((c) => c.srsLevel >= 6).length;
    const dueToday = v.conjugations.filter((c) => c.srsLevel > 0 && c.srsLevel < 6 && c.nextReviewAt && c.nextReviewAt.getTime() <= now).length;
    const pending = v.conjugations.filter((c) => c.srsLevel === 0 && !c.lastTrainedAt).length;
    const neverIntroduced = v.conjugations.every((c) => !c.lastTrainedAt);
    const anyTrained = v.conjugations.some((c) => !!c.lastTrainedAt);
    return { v: v.infinitive, total, mastered, dueToday, pending, neverIntroduced, anyTrained };
  }).sort((a, b) => {
    if (a.neverIntroduced !== b.neverIntroduced) return a.neverIntroduced ? -1 : 1;
    if ((a.dueToday > 0) !== (b.dueToday > 0)) return a.dueToday > 0 ? -1 : 1;
    const pa = a.total > 0 ? a.mastered / a.total : 0;
    const pb = b.total > 0 ? b.mastered / b.total : 0;
    if (pa !== pb) return pa - pb;
    return b.pending - a.pending;
  }).filter((r) => r.total > 0 && r.mastered < r.total);
  console.log('Sorted candidates (top 15):');
  for (const r of rows.slice(0, 15)) {
    console.log(`  ${r.v.padEnd(18)} never=${String(r.neverIntroduced).padEnd(5)} due=${r.dueToday} pending=${r.pending} mastered=${r.mastered}/${r.total} anyTrained=${r.anyTrained}`);
  }
  await p.$disconnect();
})();
