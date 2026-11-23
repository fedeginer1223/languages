import { PrismaClient } from '@prisma/client';
import fs from 'fs';
const p = new PrismaClient();
async function main() {
  const file = process.argv[2];
  if (!file) { console.log('usage: npx tsx scripts/restoreNextReviewAt.ts <backup.json>'); return; }
  const rows: { id: string; nextReviewAt: string | null }[] = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100);
    await p.$transaction(chunk.map(r => p.word.update({
      where: { id: r.id },
      data: { nextReviewAt: r.nextReviewAt ? new Date(r.nextReviewAt) : null },
    })));
    n += chunk.length;
  }
  console.log(`restored ${n}`);
}
main().finally(() => p.$disconnect());
