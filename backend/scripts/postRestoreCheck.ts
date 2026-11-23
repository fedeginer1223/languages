import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const l = await p.language.findFirst({ where: { name: 'Français' } });
  if (!l) return;
  const base = { topic: { languageId: l.id, name: { not: 'Errores de redacción' } }, source: 'vocabulary' as const };
  const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
  console.log('Niveles vocab Français:');
  for (let lvl = 0; lvl <= 6; lvl++) console.log(`  ${lvl}: ${await p.word.count({ where: { ...base, srsLevel: lvl } })}`);
  console.log(`Zombies vocab restantes: ${await p.word.count({ where: { source: 'vocabulary', attempts: { gt: 0 }, srsLevel: 0, lastTrainedAt: null } })}`);
  console.log(`Zombies dictado restantes: ${await p.word.count({ where: { source: 'vocabulary', dictationAttempts: { gt: 0 }, dictationSrsLevel: 0, dictationLastTrainedAt: null } })}`);
  console.log(`Vocab due hoy (Français): ${await p.word.count({ where: { ...base, srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } } })}`);
  console.log(`Dictado due hoy (Français): ${await p.word.count({ where: { ...base, dictationSrsLevel: { gt: 0, lt: 6 }, dictationNextReviewAt: { lte: todayEnd } } })}`);
})().finally(() => p.$disconnect());
