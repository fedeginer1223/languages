import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const pg = await p.bookPage.findFirst({ where: { bookId: '2f6a29ca-e635-44e9-99c9-90b328fa8c06', index: 20 } });
  if (!pg) return;
  const toks = pg.tokens as any[]; const anns = (pg.annotations as any[]) || [];
  const byI = new Map(anns.map((a) => [a.i, a]));
  const want = ['furent','réveillés','bruit','cheval','ouvrit','venait','chercher','descendit','marches','laissa','suivant','entra','tira','dedans','laine','présenta','tenait','lumière','tournée','montrait','dos','quelque','restait'];
  for (const t of toks) {
    if (want.includes(t.t)) { const a = byI.get(t.i); console.log(`${t.t.padEnd(12)} → ${a ? `${a.lemma} — ${a.gloss} [${a.cefr}]` : '(sin anotación)'}`); }
  }
  const covered = toks.filter((t:any)=>t.w).length; console.log(`word tokens=${covered} annotations=${anns.length}`);
})().finally(() => p.$disconnect());
