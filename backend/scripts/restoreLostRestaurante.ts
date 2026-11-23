import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Words that were at srsLevel=1 in Restaurante and got wrongly reset to
// pending when the pre-start's overdue penalty was scoped by topic. Restore
// them to level 1 with a nextReviewAt today so they show up in the next
// review pass and continue their SRS progression.
const TERMS = [
  'le poulet',
  'janvier',
  'l\'engrais',
  'avoir un penchant pour',
  'une friandise',
  'un cours',
  'prolixe',
  'Est-ce que tu es à l\'aise?',
];

(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const now = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);

  const candidates = await p.word.findMany({
    where: {
      topic: { languageId: l.id },
      source: 'vocabulary',
      term: { in: TERMS },
      srsLevel: 0,
      lastTrainedAt: null,
    },
    include: { topic: true },
  });

  console.log(`Found ${candidates.length} candidates to restore:`);
  for (const w of candidates) {
    console.log(`  - ${w.term} (topic: ${w.topic.name})`);
  }

  const ids = candidates.map((w) => w.id);
  if (ids.length === 0) {
    console.log('Nothing to restore.');
  } else {
    // Restore to srsLevel=1, lastTrainedAt=today, nextReviewAt=today (due now)
    // so the user sees them in the next pre-start.
    await p.word.updateMany({
      where: { id: { in: ids } },
      data: { srsLevel: 1, lastTrainedAt: today, nextReviewAt: today },
    });
    console.log(`Restored ${ids.length} words to level 1, due today.`);
  }
  await p.$disconnect();
})();
