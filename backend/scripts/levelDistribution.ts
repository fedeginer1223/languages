import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const base = { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const };

  console.log('=== Distribución por nivel SRS (vocab Français) ===');
  for (let lvl = 0; lvl <= 6; lvl++) {
    const c = await p.word.count({ where: { ...base, srsLevel: lvl } });
    console.log(`  nivel ${lvl}: ${c}`);
  }

  // Oldest lastTrainedAt among in-progress — how long has the user been using SRS?
  const oldest = await p.word.findFirst({
    where: { ...base, lastTrainedAt: { not: null } },
    orderBy: { lastTrainedAt: 'asc' },
    select: { term: true, lastTrainedAt: true, srsLevel: true },
  });
  const firstCreated = await p.word.findFirst({ where: base, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
  console.log(`\nPrimera palabra creada: ${firstCreated?.createdAt.toISOString().slice(0,10)}`);
  console.log(`Entrenamiento más antiguo aún registrado: ${oldest?.lastTrainedAt?.toISOString().slice(0,10)} (${oldest?.term}, lvl ${oldest?.srsLevel})`);

  // Words at level >= 3: when were they last trained and when is next?
  const high = await p.word.findMany({
    where: { ...base, srsLevel: { gte: 3 } },
    orderBy: { srsLevel: 'desc' },
    select: { term: true, srsLevel: true, lastTrainedAt: true, nextReviewAt: true, attempts: true, correctCount: true },
    take: 15,
  });
  console.log(`\n=== Palabras en nivel >= 3 (top 15) ===`);
  for (const w of high) {
    console.log(`  ${w.term.padEnd(30)} lvl=${w.srsLevel} last=${w.lastTrainedAt?.toISOString().slice(0,10)} next=${w.nextReviewAt?.toISOString().slice(0,10)} att=${w.attempts}/${w.correctCount}`);
  }

  // How many times has the overdue penalty likely hit? Words with attempts >= 6 but still level <= 2 suggest repeated resets.
  const stuck = await p.word.count({ where: { ...base, attempts: { gte: 8 }, srsLevel: { lte: 2 } } });
  console.log(`\nPalabras con >=8 intentos pero nivel <=2 (candidatas a "reset loop"): ${stuck}`);
  const stuckSample = await p.word.findMany({
    where: { ...base, attempts: { gte: 8 }, srsLevel: { lte: 2 } },
    orderBy: { attempts: 'desc' },
    select: { term: true, srsLevel: true, attempts: true, correctCount: true, lastTrainedAt: true, recentResults: true },
    take: 10,
  });
  for (const w of stuckSample) {
    console.log(`  ${w.term.padEnd(30)} lvl=${w.srsLevel} att=${w.attempts}/${w.correctCount} last=${w.lastTrainedAt?.toISOString().slice(0,10)} recent=${w.recentResults.slice(-12)}`);
  }
})().finally(() => p.$disconnect());
