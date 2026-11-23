import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const v = await p.verb.findFirst({ where: { languageId: l.id, infinitive: 'avoir' }, include: { conjugations: true } });
  if (!v) return;
  const totalAttempts = v.conjugations.reduce((a, c) => a + c.attempts, 0);
  const totalCorrect = v.conjugations.reduce((a, c) => a + c.correctCount, 0);
  const withAttempts = v.conjugations.filter((c) => c.attempts > 0);
  console.log(`avoir: totalAttempts=${totalAttempts} totalCorrect=${totalCorrect}`);
  console.log(`Conjugations with attempts>0: ${withAttempts.length}`);
  for (const c of withAttempts.slice(0, 6)) {
    console.log(`  ${c.tense} ${c.person} → attempts=${c.attempts} correct=${c.correctCount} lvl=${c.srsLevel} last=${c.lastTrainedAt} next=${c.nextReviewAt}`);
  }
})().finally(() => p.$disconnect());
