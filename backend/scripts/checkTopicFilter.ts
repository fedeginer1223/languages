import { srsService } from '../src/services/srsService';
import { dueCountsService } from '../src/services/dueCountsService';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;

  const badge = await dueCountsService.getForLanguage(l.id);
  console.log(`Sidebar badge (dueCountsService): vocab=${badge.vocabulary}`);

  const noTopic = await srsService.getDailyGlobal(l.id, undefined, 15, 'random', false);
  console.log(`\nNO topic filter:`);
  console.log(`  reviewCount=${noTopic.summary.reviewCount}  newCount=${noTopic.summary.newCount}  totalCount=${noTopic.summary.totalCount}`);
  console.log(`  inProgress=${noTopic.summary.inProgress}  pending=${noTopic.summary.pending}  mastered=${noTopic.summary.mastered}`);

  const topics = await p.topic.findMany({ where: { languageId: l.id } });
  for (const t of topics.slice(0, 5)) {
    const r = await srsService.getDailyGlobal(l.id, [t.id], 15, 'random', false);
    console.log(`\nTopic filter = "${t.name}":`);
    console.log(`  reviewCount=${r.summary.reviewCount}  newCount=${r.summary.newCount}  totalCount=${r.summary.totalCount}`);
    console.log(`  inProgress=${r.summary.inProgress}  pending=${r.summary.pending}  mastered=${r.summary.mastered}`);
  }
  await p.$disconnect();
})();
