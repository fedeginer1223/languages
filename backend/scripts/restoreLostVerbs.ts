import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const today = new Date(); today.setHours(0,0,0,0);
  // Conjugations with a real history (attempts > 0) but state that says
  // "never trained" (level 0, lastTrainedAt null). These were nuked by the
  // old overdue penalty. Restore them: level 1, due today.
  const zombies = await p.verbConjugation.findMany({
    where: { attempts: { gt: 0 }, srsLevel: 0, lastTrainedAt: null },
    include: { verb: true },
  });
  const byVerb = new Map<string, number>();
  for (const z of zombies) {
    byVerb.set(z.verb.infinitive, (byVerb.get(z.verb.infinitive) ?? 0) + 1);
  }
  console.log(`Found ${zombies.length} orphan conjugations across ${byVerb.size} verbs:`);
  for (const [name, count] of byVerb) console.log(`  ${name}: ${count}`);

  if (zombies.length === 0) { await p.$disconnect(); return; }
  await p.verbConjugation.updateMany({
    where: { id: { in: zombies.map((z) => z.id) } },
    data: { srsLevel: 1, lastTrainedAt: today, nextReviewAt: today },
  });
  console.log(`Restored ${zombies.length} conjugations to level 1, due today.`);
  await p.$disconnect();
})();
