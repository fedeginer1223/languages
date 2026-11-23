import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const b = await p.book.findFirst({ where: { title: { contains: 'ovary', mode: 'insensitive' } } });
  if (!b) { console.log('no bovary'); return; }
  console.log({ title: b.title, totalPages: b.totalPages, totalWords: b.totalWords, annotatedPages: await p.bookPage.count({ where: { bookId: b.id, annotatedAt: { not: null } } }), cost: (b.inputTokens*2+b.outputTokens*10+b.cacheReadTokens*0.2)/1e6 });
  const pg = await p.bookPage.findFirst({ where: { bookId: b.id, index: 24 } });
  if (pg) {
    console.log('--- page 24 raw (\\n shown as ⏎) ---');
    console.log(pg.text.slice(0, 1400).replace(/\n/g, '⏎\n'));
    const anns = (pg.annotations as any[]) || [];
    const big = anns.filter((a) => a.span > 4);
    console.log('--- annotations:', anns.length, 'with span>4:', big.length, big.slice(0, 5));
  }
  const chapters = await p.bookPage.findMany({ where: { bookId: b.id, chapterTitle: { not: null } }, select: { index: true, chapterTitle: true }, orderBy: { index: 'asc' }, take: 12 });
  console.log('--- chapters sample:', chapters);
})().finally(() => p.$disconnect());
