import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const INTERVALS: Record<number, number> = { 1: 3, 2: 7, 3: 15, 4: 30, 5: 90 };
const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
const clamp = (n: number) => Math.min(5, Math.max(1, n));
const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(0, 0, 0, 0); return r; };

function histogram(levels: number[]) {
  const h: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const l of levels) h[l]++;
  return JSON.stringify(h);
}
function chunks<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

(async () => {
  try {
    // a) Vocab
    const vocab = await prisma.word.findMany({
      where: { source: 'vocabulary', srsLevel: 1, lastTrainedAt: todayStart, nextReviewAt: todayStart },
      select: { id: true, term: true, correctCount: true },
    });
    if (vocab.length === 0) {
      console.log('No restored vocab rows found — aborting');
      return;
    }
    const vUpdates = vocab.map((w) => {
      const level = clamp(Math.round(w.correctCount / 2));
      return { id: w.id, level, nextReviewAt: addDays(todayStart, INTERVALS[level]) };
    });
    for (const c of chunks(vUpdates, 100)) {
      await prisma.$transaction(c.map((u) => prisma.word.update({ where: { id: u.id }, data: { srsLevel: u.level, nextReviewAt: u.nextReviewAt } })));
    }
    console.log(`Vocab re-estimated: ${vUpdates.length}  histogram: ${histogram(vUpdates.map((u) => u.level))}`);

    // b) Dictation
    const dict = await prisma.word.findMany({
      where: { dictationSrsLevel: 1, dictationLastTrainedAt: todayStart, dictationNextReviewAt: todayStart },
      select: { id: true, term: true, dictationCorrectCount: true },
    });
    const dUpdates = dict.map((w) => {
      const level = clamp(w.dictationCorrectCount);
      return { id: w.id, level, next: addDays(todayStart, INTERVALS[level]) };
    });
    for (const c of chunks(dUpdates, 100)) {
      await prisma.$transaction(c.map((u) => prisma.word.update({ where: { id: u.id }, data: { dictationSrsLevel: u.level, dictationNextReviewAt: u.next } })));
    }
    console.log(`Dictation re-estimated: ${dUpdates.length}  histogram: ${histogram(dUpdates.map((u) => u.level))}`);

    // c) Structures
    const structs = await prisma.structure.findMany({
      where: { srsLevel: 1, lastTrainedAt: todayStart, nextReviewAt: todayStart },
      select: { id: true, correctCount: true },
    });
    const sUpdates = structs.map((s) => {
      const level = clamp(s.correctCount);
      return { id: s.id, level, next: addDays(todayStart, INTERVALS[level]) };
    });
    for (const c of chunks(sUpdates, 100)) {
      await prisma.$transaction(c.map((u) => prisma.structure.update({ where: { id: u.id }, data: { srsLevel: u.level, nextReviewAt: u.next } })));
    }
    console.log(`Structures re-estimated: ${sUpdates.length}  histogram: ${histogram(sUpdates.map((u) => u.level))}`);

    // d) Français summary
    const lang = await prisma.language.findFirst({ where: { name: 'Français' } });
    if (!lang) { console.log("Language 'Français' not found"); return; }
    const topic = { languageId: lang.id, name: { not: 'Errores de redacción' } };
    const dist: Record<number, number> = {};
    for (let l = 0; l <= 6; l++) {
      dist[l] = await prisma.word.count({ where: { topic, source: 'vocabulary', srsLevel: l } });
    }
    console.log('Français vocab level distribution:', JSON.stringify(dist));
    const vocabDue = await prisma.word.count({ where: { topic, source: 'vocabulary', srsLevel: { gt: 0, lt: 6 }, nextReviewAt: { lte: todayEnd } } });
    const dictDue = await prisma.word.count({ where: { topic, source: 'vocabulary', dictationSrsLevel: { gt: 0, lt: 6 }, dictationNextReviewAt: { lte: todayEnd } } });
    console.log(`Français due today — vocab: ${vocabDue}, dictation: ${dictDue}`);
  } finally {
    await prisma.$disconnect();
  }
})();
