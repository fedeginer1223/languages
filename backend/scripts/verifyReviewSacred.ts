import { srsService } from '../src/services/srsService';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const r = await srsService.getDailyGlobal(l.id, undefined, 15, 'random', false);
  console.log(`Sin topic: reviewCount=${r.summary.reviewCount}, words in array with label review/atrasada = ${r.words.filter((w:any)=>w.label==='recordar'||w.label==='atrasada').length}, labels distribution:`);
  const dist:Record<string,number> = {};
  for (const w of r.words as any[]) dist[w.label] = (dist[w.label] || 0) + 1;
  console.log(dist);

  const topic = await p.topic.findFirst({ where: { languageId: l.id, name: 'Restaurante' } });
  if (topic) {
    const r2 = await srsService.getDailyGlobal(l.id, [topic.id], 15, 'random', false);
    console.log(`\nCon Restaurante: reviewCount=${r2.summary.reviewCount}, total=${r2.words.length}, labels:`);
    const dist2:Record<string,number> = {};
    for (const w of r2.words as any[]) dist2[w.label] = (dist2[w.label] || 0) + 1;
    console.log(dist2);
  }
  await p.$disconnect();
})();
