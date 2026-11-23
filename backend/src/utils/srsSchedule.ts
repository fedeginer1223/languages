export function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(r.getDate() + n); r.setHours(0, 0, 0, 0); return r; }

/** intervalDays ± up to 15 % (rounded), never below 1 day. 3→3, 7→6..8, 15→13..17, 30→25..35 */
export function scheduleNext(now: Date, intervalDays: number): Date {
  const spread = Math.max(0, Math.round(intervalDays * 0.15));
  const j = Math.floor(Math.random() * (2 * spread + 1)) - spread;
  return addDays(now, Math.max(1, intervalDays + j));
}
