import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const since = new Date(Date.now() - 3 * 3600 * 1000);
  const pages = await p.bookPage.findMany({ where: { annotatedAt: { gte: since } }, include: { book: { select: { title: true } } }, orderBy: { annotatedAt: 'desc' }, take: 8 });
  console.log(`Páginas anotadas en las últimas 3 h: ${pages.length}`);
  for (const pg of pages) {
    const toks = pg.tokens as any[]; const anns = (pg.annotations as any[]) || [];
    const words = toks.filter((t:any)=>t.w).length;
    const verbs = anns.filter((a:any)=>/^(se |s')?\w+(er|ir|re|oir)$/u.test(a.lemma)).slice(0, 6).map((a:any)=>`${toks[a.i]?.t}→${a.gloss}`);
    console.log(`\n[${pg.book.title}] pág ${pg.index+1} · ${pg.annotatedAt?.toISOString().slice(11,19)}Z · words=${words} anns=${anns.length}`);
    console.log('  verbos:', verbs.join(' | '));
  }
})().finally(() => p.$disconnect());
