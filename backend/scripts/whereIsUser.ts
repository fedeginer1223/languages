import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const books = await p.book.findMany({ where: { title: { contains: 'Bovary' } }, select: { id: true, title: true, lastPageIndex: true, updatedAt: true, _count: { select: { pages: { where: { annotatedAt: { not: null } } } } } } });
  for (const b of books) {
    const last = await p.bookPage.findFirst({ where: { bookId: b.id, annotatedAt: { not: null } }, orderBy: { annotatedAt: 'desc' }, select: { index: true, annotatedAt: true } });
    console.log(`${b.title} | lastPageIndex=${b.lastPageIndex} | annotated=${b._count.pages} | última anotación: pág ${last ? last.index+1 : '-'} @ ${last?.annotatedAt?.toISOString()} | updatedAt ${b.updatedAt.toISOString()}`);
  }
})().finally(() => p.$disconnect());
