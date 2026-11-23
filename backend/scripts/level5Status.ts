import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const now = new Date();
  for (const name of ['Français', 'English']) {
    const l = await p.language.findFirst({ where: { name } }); if (!l) continue;
    const base = { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const };
    const lvl5 = await p.word.findMany({ where: { ...base, srsLevel: 5 }, select: { term: true, lastTrainedAt: true, nextReviewAt: true }, orderBy: { nextReviewAt: 'asc' } });
    const lvl4 = await p.word.count({ where: { ...base, srsLevel: 4 } });
    const lvl6 = await p.word.count({ where: { ...base, srsLevel: 6 } });
    console.log(`\n=== ${name}: nivel 4 = ${lvl4} · nivel 5 = ${lvl5.length} · nivel 6 = ${lvl6}`);
    const byDate = new Map<string, number>();
    for (const w of lvl5) { const k = w.nextReviewAt?.toISOString().slice(0,10) ?? 'null'; byDate.set(k, (byDate.get(k)||0)+1); }
    for (const [d, c] of [...byDate.entries()].sort()) {
      const days = Math.round((new Date(d).getTime() - now.getTime()) / 86400000);
      console.log(`  vence ${d} (${days >= 0 ? 'en ' + days + ' días' : 'hace ' + (-days) + ' días'}): ${c} palabras`);
    }
    const soon = lvl5.filter((w) => w.nextReviewAt && (w.nextReviewAt.getTime() - now.getTime()) / 86400000 <= 14).slice(0, 8);
    if (soon.length) console.log('  próximas:', soon.map((w) => `${w.term} (${w.nextReviewAt!.toISOString().slice(0,10)})`).join(', '));
    // Dictation level 5
    const d5 = await p.word.count({ where: { ...base, dictationSrsLevel: 5 } });
    const s5 = await p.structure.count({ where: { languageId: l.id, srsLevel: 5 } });
    const v5 = await p.verbConjugation.count({ where: { verb: { languageId: l.id }, srsLevel: 5 } });
    console.log(`  (dictado nivel 5: ${d5} · estructuras nivel 5: ${s5} · conjugaciones nivel 5: ${v5})`);
  }
})().finally(() => p.$disconnect());
