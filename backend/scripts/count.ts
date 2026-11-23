import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const topics = await p.topic.findMany({ where: { name: { contains: 'Restaurante' } }, include: { language: true } });
  for (const t of topics) {
    const total = await p.word.count({ where: { topicId: t.id, source: 'vocabulary' } });
    const pending = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: 0, lastTrainedAt: null } });
    const inProgress = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 } } });
    const mastered = await p.word.count({ where: { topicId: t.id, source: 'vocabulary', srsLevel: 6 } });
    console.log(`Topic "${t.name}" (${t.language.name}): total=${total}, pending=${pending}, inProgress=${inProgress}, mastered=${mastered}`);
    // Also fetch first 60 pending (like the getDaily would with topic filter)
    const found = await p.word.findMany({ where: { topicId: t.id, source: 'vocabulary', srsLevel: 0, lastTrainedAt: null } });
    console.log(`  fetched pending: ${found.length}`);
  }
  await p.$disconnect();
})();
