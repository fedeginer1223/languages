import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const words = await p.word.findMany({
    where: { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' },
    select: { term: true, definition: true, topic: { select: { name: true } } },
    orderBy: { term: 'asc' },
  });
  for (const w of words) {
    console.log(`${w.term}\t${w.definition}\t${w.topic.name}`);
  }
})().finally(() => p.$disconnect());
