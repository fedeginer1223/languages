import { srsService } from '../src/services/srsService';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const topic = await p.topic.findFirst({ where: { name: 'Restaurante' }, include: { language: true } });
  if (!topic) { console.log('no topic'); process.exit(0); }
  const r = await srsService.getDailyGlobal(topic.languageId, [topic.id], 50, 'random', false);
  console.log('summary:', JSON.stringify(r.summary, null, 2));
  console.log('words.length:', r.words.length);
  console.log('unique ids:', new Set(r.words.map((w:any)=>w.id)).size);
  await p.$disconnect();
})();
