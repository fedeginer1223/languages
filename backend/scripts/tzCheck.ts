import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const now = new Date();
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  console.log(`Server local now: ${now.toString()}`);
  console.log(`Server local todayEnd: ${todayEnd.toString()}`);
  console.log(`todayEnd ISO (UTC): ${todayEnd.toISOString()}`);
  console.log(`Timezone offset: ${now.getTimezoneOffset()} min`);

  // Fetch one of the "due today" words with full timestamp
  const w = await p.word.findFirst({
    where: { term: 'janvier' },
    select: { term: true, nextReviewAt: true, lastTrainedAt: true, srsLevel: true },
  });
  console.log(`\njanvier:`, w);
  console.log(`  nextReviewAt ISO: ${w?.nextReviewAt?.toISOString()}`);
  console.log(`  nextReviewAt local: ${w?.nextReviewAt?.toString()}`);
  console.log(`  <= todayEnd? ${w?.nextReviewAt && w.nextReviewAt <= todayEnd}`);

  // Ask Postgres directly what NOW() is
  const dbNow = await p.$queryRaw<any[]>`SELECT NOW() as now, CURRENT_DATE as today`;
  console.log(`\nDB NOW: ${JSON.stringify(dbNow[0])}`);

  await p.$disconnect();
})();
