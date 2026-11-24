import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma';
import { addDays } from '../utils/srsSchedule';
import { DEFAULT_SESSION_SIZE } from '../utils/sessionComposer';

/** Reviews per day we aim for (half of a default session). */
export const REVIEWS_PER_DAY = Math.ceil(DEFAULT_SESSION_SIZE / 2);
const MAX_DAYS_AHEAD = 120;
const CHUNK = 100;
const BACKUP_DIR = path.resolve(__dirname, '../../backups');

export type SrsModule = 'vocab' | 'structures';
export const SRS_MODULES: SrsModule[] = ['vocab', 'structures'];

export interface ModuleReport {
  due: number;
  moved: number;
  perDay: Record<string, number>;
}
export type RebalanceReport = Record<SrsModule, ModuleReport> & { skipped?: boolean };

interface Item { id: string; level: number; at: Date; name: string }

function endOfDay(d: Date): Date { const r = new Date(d); r.setHours(23, 59, 59, 999); return r; }
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const wordTopic = (languageId: string) => ({ languageId, name: { not: 'Errores de redacción' } });

/** Per-module data access: items level 1-5 scheduled in [from, to]. */
async function fetchScheduled(module: SrsModule, languageId: string, from: Date | null, to: Date): Promise<Item[]> {
  if (module === 'vocab') {
    const rows = await prisma.word.findMany({
      where: {
        topic: wordTopic(languageId), source: 'vocabulary',
        srsLevel: { gte: 1, lte: 5 },
        nextReviewAt: from ? { gte: from, lte: to } : { lte: to },
      },
      select: { id: true, srsLevel: true, nextReviewAt: true, term: true },
    });
    return rows.map((r) => ({ id: r.id, level: r.srsLevel, at: r.nextReviewAt!, name: r.term }));
  }
  const rows = await prisma.structure.findMany({
    where: {
      languageId,
      srsLevel: { gte: 1, lte: 5 },
      nextReviewAt: from ? { gte: from, lte: to } : { lte: to },
    },
    select: { id: true, srsLevel: true, nextReviewAt: true, pattern: true },
  });
  return rows.map((r) => ({ id: r.id, level: r.srsLevel, at: r.nextReviewAt!, name: r.pattern }));
}

async function writeDates(module: SrsModule, updates: { id: string; at: Date }[]) {
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    await prisma.$transaction(chunk.map((u) => {
      if (module === 'vocab') return prisma.word.update({ where: { id: u.id }, data: { nextReviewAt: u.at } });
      return prisma.structure.update({ where: { id: u.id }, data: { nextReviewAt: u.at } });
    }));
  }
}

async function rebalanceModule(module: SrsModule, languageId: string, now: Date, dryRun: boolean): Promise<ModuleReport> {
  const R = REVIEWS_PER_DAY;
  const todayEnd = endOfDay(now);
  const due = await fetchScheduled(module, languageId, null, todayEnd);
  const report: ModuleReport = { due: due.length, moved: 0, perDay: {} };
  if (due.length <= 2 * R) return report;

  due.sort((a, b) => b.level - a.level || a.at.getTime() - b.at.getTime() || a.name.localeCompare(b.name));
  const toMove = due.slice(R);

  // Capacity of future days, from what is already scheduled there.
  const horizonEnd = endOfDay(addDays(now, MAX_DAYS_AHEAD));
  const future = await fetchScheduled(module, languageId, addDays(now, 1), horizonEnd);
  const scheduled: Record<string, number> = {};
  for (const f of future) scheduled[dayKey(f.at)] = (scheduled[dayKey(f.at)] || 0) + 1;

  const updates: { id: string; at: Date }[] = [];
  let d = 1;
  for (const item of toMove) {
    let day = addDays(now, Math.min(d, MAX_DAYS_AHEAD));
    while (d < MAX_DAYS_AHEAD && R - (scheduled[dayKey(day)] || 0) <= 0) {
      d++;
      day = addDays(now, d);
    }
    const key = dayKey(day);
    scheduled[key] = (scheduled[key] || 0) + 1;
    report.perDay[key] = (report.perDay[key] || 0) + 1;
    updates.push({ id: item.id, at: day });
  }
  report.moved = updates.length;

  if (!dryRun) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const original = new Map(toMove.map((i) => [i.id, i.at]));
    const file = path.join(BACKUP_DIR, `rebalance-${module}-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(updates.map((u) => ({ id: u.id, nextReviewAt: original.get(u.id)!.toISOString() })), null, 2));
    await writeDates(module, updates);
    fs.appendFileSync(
      path.join(BACKUP_DIR, 'rebalance.log'),
      `${new Date().toISOString()} language=${languageId} module=${module} due=${report.due} moved=${report.moved} backup=${path.basename(file)}\n`,
    );
  }
  return report;
}

// In-memory "already ran today" guard. A restart just allows one more (harmless) run.
const lastRun = new Map<string, string>();

export const srsBacklogService = {
  async rebalanceIfNeeded(languageId: string, opts: { dryRun?: boolean } = {}): Promise<RebalanceReport> {
    const now = new Date();
    const today = dayKey(now);
    const empty = (): ModuleReport => ({ due: 0, moved: 0, perDay: {} });
    if (!opts.dryRun && lastRun.get(languageId) === today) {
      return { vocab: empty(), structures: empty(), skipped: true };
    }
    const report = {} as RebalanceReport;
    for (const m of SRS_MODULES) report[m] = await rebalanceModule(m, languageId, now, !!opts.dryRun);
    if (!opts.dryRun) lastRun.set(languageId, today);
    return report;
  },

  /** Read-only: due today + per-day counts for the next `days` days, per module. */
  async getBacklog(languageId: string, days = 7) {
    const now = new Date();
    const out: Record<string, { dueToday: number; next: Record<string, number> }> = {};
    for (const m of SRS_MODULES) {
      const dueToday = (await fetchScheduled(m, languageId, null, endOfDay(now))).length;
      const future = await fetchScheduled(m, languageId, addDays(now, 1), endOfDay(addDays(now, days)));
      const next: Record<string, number> = {};
      for (let i = 1; i <= days; i++) next[dayKey(addDays(now, i))] = 0;
      for (const f of future) { const k = dayKey(f.at); if (k in next) next[k]++; }
      out[m] = { dueToday, next };
    }
    return out;
  },
};
