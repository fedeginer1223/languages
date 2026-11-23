import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const v = await p.verb.findFirst({ where: { languageId: l.id, infinitive: 'avoir' }, include: { conjugations: true } });
  if (!v) return;
  const trained = v.conjugations.filter((c) => !!c.lastTrainedAt).length;
  const inProgress = v.conjugations.filter((c) => c.srsLevel > 0 && c.srsLevel < 6).length;
  const mastered = v.conjugations.filter((c) => c.srsLevel >= 6).length;
  const neverIntroduced = v.conjugations.every((c) => !c.lastTrainedAt);
  console.log(`avoir: trained=${trained} inProgress=${inProgress} mastered=${mastered} neverIntroduced=${neverIntroduced} total=${v.conjugations.length}`);
})().finally(() => p.$disconnect());
