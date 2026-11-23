import { prisma } from '../src/utils/prisma';

async function main() {
  const langs = await prisma.language.findMany({ select: { id: true, name: true } });
  for (const l of langs) {
    const lid = l.id;
    const v = await prisma.word.updateMany({ where: { topic: { languageId: lid }, srsLevel: 5 }, data: { srsLevel: 6, nextReviewAt: null } });
    const d = await prisma.word.updateMany({ where: { topic: { languageId: lid }, dictationSrsLevel: 5 }, data: { dictationSrsLevel: 6, dictationNextReviewAt: null } });
    const s = await prisma.structure.updateMany({ where: { languageId: lid, srsLevel: 5 }, data: { srsLevel: 6, nextReviewAt: null } });
    const c = await prisma.verbConjugation.updateMany({ where: { srsLevel: 5, verb: { languageId: lid } }, data: { srsLevel: 6, nextReviewAt: null } });
    console.log(`${l.name}: vocab ${v.count}, dictation ${d.count}, structures ${s.count}, verbConj ${c.count} (matched=updated)`);
  }
  const fr = langs.find((x) => /fran/i.test(x.name));
  if (fr) {
    const g = await prisma.word.groupBy({ by: ["srsLevel"], where: { topic: { languageId: fr.id } }, _count: true });
    const m = Object.fromEntries(g.map((x) => [x.srsLevel, x._count]));
    console.log(`${fr.name} vocab distribution:`, [0, 1, 2, 3, 4, 5, 6].map((i) => `L${i}=${m[i] ?? 0}`).join(' '));
  }
}
main().finally(() => prisma.$disconnect());
