/**
 * Restore nextReviewAt values saved by srsBacklogService before a rebalance.
 * Usage: npx tsx scripts/restoreRebalance.ts backups/rebalance-<module>-<ts>.json
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../src/utils/prisma';

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Usage: restoreRebalance.ts <backupFile>');
  const m = path.basename(file).match(/^rebalance-(vocab|structures)-/);
  if (!m) throw new Error('Cannot detect module from filename');
  const module = m[1];
  const rows: { id: string; nextReviewAt: string }[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (let i = 0; i < rows.length; i += 100) {
    await prisma.$transaction(rows.slice(i, i + 100).map((r) => {
      const at = new Date(r.nextReviewAt);
      if (module === 'vocab') return prisma.word.update({ where: { id: r.id }, data: { nextReviewAt: at } });
      return prisma.structure.update({ where: { id: r.id }, data: { nextReviewAt: at } });
    }));
  }
  console.log(`Restored ${rows.length} ${module} items from ${file}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
