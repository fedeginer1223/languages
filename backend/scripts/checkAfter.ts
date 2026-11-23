import { dueCountsService } from '../src/services/dueCountsService';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const langs = await p.language.findMany();
  for (const l of langs) {
    const c = await dueCountsService.getForLanguage(l.id);
    console.log(`${l.name}:`, c);
  }
  await p.$disconnect();
})();
