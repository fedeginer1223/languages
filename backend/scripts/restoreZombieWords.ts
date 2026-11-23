import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const vocab = await p.word.findMany({
      where: { source: 'vocabulary', attempts: { gt: 0 }, srsLevel: 0, lastTrainedAt: null },
      include: { topic: true },
    });
    console.log(`Vocab zombies: ${vocab.length}`);
    for (const w of vocab.slice(0, 15)) console.log(`  ${w.term}  ${w.attempts}/${w.correctCount}  ${w.topic?.name}`);
    if (vocab.length) {
      await p.word.updateMany({
        where: { id: { in: vocab.map((w) => w.id) } },
        data: { srsLevel: 1, lastTrainedAt: today, nextReviewAt: today },
      });
    }

    const dict = await p.word.findMany({
      where: { dictationAttempts: { gt: 0 }, dictationSrsLevel: 0, dictationLastTrainedAt: null },
      include: { topic: true },
    });
    console.log(`Dictation zombies: ${dict.length}`);
    for (const w of dict.slice(0, 15)) console.log(`  ${w.term}  ${w.dictationAttempts}  ${w.topic?.name}`);
    if (dict.length) {
      await p.word.updateMany({
        where: { id: { in: dict.map((w) => w.id) } },
        data: { dictationSrsLevel: 1, dictationLastTrainedAt: today, dictationNextReviewAt: today },
      });
    }

    const structs = await p.structure.findMany({
      where: { attempts: { gt: 0 }, srsLevel: 0, lastTrainedAt: null },
    });
    console.log(`Structure zombies: ${structs.length}`);
    for (const s of structs.slice(0, 15)) console.log(`  ${s.pattern}`);
    if (structs.length) {
      await p.structure.updateMany({
        where: { id: { in: structs.map((s) => s.id) } },
        data: { srsLevel: 1, lastTrainedAt: today, nextReviewAt: today },
      });
    }

    console.log(`Restored ${vocab.length} vocab / ${dict.length} dictation / ${structs.length} structures`);
  } finally {
    await p.$disconnect();
  }
})();
