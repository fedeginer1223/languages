import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const v = await p.verb.findFirst({ where: { infinitive: 'connaître' }, include: { conjugations: { orderBy: [{ tense: 'asc' }, { person: 'asc' }] } } });
  if (!v) return console.log('no verb');
  console.log(`Verb: ${v.infinitive} (translation: ${(v as any).translation})`);
  const byTense: Record<string, string[]> = {};
  for (const c of v.conjugations) {
    (byTense[c.tense] ??= []).push(`${c.person} → ${c.form}`);
  }
  for (const [t, arr] of Object.entries(byTense)) {
    console.log(`  ${t} (${arr.length}):`);
    for (const x of arr) console.log(`    ${x}`);
  }
  await p.$disconnect();
})();
