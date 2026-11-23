import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const p = new PrismaClient();
const day = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
async function counts(where: any) {
  const rows = await p.word.findMany({ where, select: { nextReviewAt: true } });
  const m: Record<string, number> = {};
  for (const r of rows) { const k = day(r.nextReviewAt!); m[k] = (m[k] || 0) + 1; }
  return m;
}
async function main() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const base = { topic: { language: { name: 'Français' } }, source: 'vocabulary' };
  const rows = await p.word.findMany({
    where: { ...base, srsLevel: { gte: 1, lte: 5 }, nextReviewAt: { lt: today } },
    select: { id: true, term: true, srsLevel: true, nextReviewAt: true },
  });
  console.log('matched', rows.length);
  if (rows.length === 0 || rows.length > 400) { console.log('unexpected count, aborting'); return; }
  const bf = `scripts/backups/spreadOverdueBacklog-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(bf, JSON.stringify(rows.map(r => ({ id: r.id, nextReviewAt: r.nextReviewAt })), null, 1));
  console.log('backup', bf);
  rows.sort((a, b) => b.srsLevel - a.srsLevel || a.nextReviewAt!.getTime() - b.nextReviewAt!.getTime() || a.term.localeCompare(b.term));
  const buckets = [1,2,3,4,5].map(d => new Date(2026, 10, d));
  const upd = rows.map((r, i) => p.word.update({ where: { id: r.id }, data: { nextReviewAt: buckets[i % 5] } }));
  for (let i = 0; i < upd.length; i += 100) await p.$transaction(upd.slice(i, i + 100));
  console.log('per-day (updated rows):');
  const per: Record<string, number> = {};
  rows.forEach((_, i) => { const k = day(buckets[i % 5]); per[k] = (per[k] || 0) + 1; });
  console.log(per);
  const end = new Date(today); end.setDate(end.getDate() + 1);
  const due = await p.word.count({ where: { ...base, srsLevel: { gte: 1, lte: 5 }, nextReviewAt: { lt: end } } });
  console.log('due today (<= end of today, srs 1-5):', due);
  const e7 = new Date(today); e7.setDate(e7.getDate() + 7);
  const next = await counts({ ...base, nextReviewAt: { gte: today, lt: e7 } });
  console.log('next 7 days due per day:'); console.log(next);
}
main().finally(() => p.$disconnect());
