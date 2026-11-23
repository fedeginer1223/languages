/**
 * One-shot import: reads /Users/federicohappyrobot/Downloads/export\ 1\ english.xlsx
 * and inserts the terms into English under a single topic ("Vocabulario general"
 * by default). Idempotent by term (case-insensitive) within the topic — re-runs
 * skip anything already imported.
 *
 * Merges continuation columns (__EMPTY, __EMPTY_1, __EMPTY_2) into the
 * definition — the Excel export split definitions with commas across columns.
 *
 * Usage:
 *   npx tsx scripts/importEnglishVocab.ts [filePath] [topicName]
 */
import { PrismaClient } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

const prisma = new PrismaClient();

const DEFAULT_FILE = '/Users/federicohappyrobot/Downloads/export 1 english.xlsx';
const DEFAULT_TOPIC = 'Vocabulario general';

async function main() {
  const filePath = process.argv[2] || DEFAULT_FILE;
  const topicName = process.argv[3] || DEFAULT_TOPIC;

  const language = await prisma.language.findUnique({ where: { code: 'en' } });
  if (!language) {
    console.error('English language (code "en") not found. Create it first.');
    process.exit(1);
  }

  let topic = await prisma.topic.findFirst({
    where: { languageId: language.id, name: topicName },
  });
  if (!topic) {
    topic = await prisma.topic.create({
      data: { languageId: language.id, name: topicName, description: 'Vocabulario importado desde export xlsx' },
    });
    console.log(`Created topic "${topicName}".`);
  } else {
    console.log(`Using existing topic "${topicName}" (${topic.id}).`);
  }

  const wb = XLSX.readFile(filePath);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  // Merge continuation columns into a single definition string.
  const merged = rows.map((r) => {
    const term = String(r.term ?? '').trim();
    const parts = [
      String(r.definition ?? ''),
      String((r as any).__EMPTY ?? ''),
      String((r as any).__EMPTY_1 ?? ''),
      String((r as any).__EMPTY_2 ?? ''),
    ]
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    const definition = parts.join(', ');
    return { term, definition };
  }).filter((r) => r.term.length > 0 && r.definition.length > 0);

  // Dedupe by lowercased term (Excel had a few dupes).
  const seen = new Map<string, { term: string; definition: string }>();
  for (const r of merged) {
    const key = r.term.toLowerCase();
    if (!seen.has(key)) seen.set(key, r);
  }
  const items = Array.from(seen.values());
  console.log(`Parsed ${rows.length} rows → ${items.length} unique terms.`);

  // Look up existing terms in this topic to skip.
  const existing = await prisma.word.findMany({
    where: { topicId: topic.id },
    select: { term: true },
  });
  const existingSet = new Set(existing.map((w) => w.term.toLowerCase()));

  const toInsert = items.filter((it) => !existingSet.has(it.term.toLowerCase()));
  console.log(`Skipping ${items.length - toInsert.length} already-present terms.`);
  console.log(`Inserting ${toInsert.length} new terms…`);

  if (toInsert.length === 0) {
    console.log('Nothing to do.');
    await prisma.$disconnect();
    return;
  }

  // Bulk in chunks to avoid overloading a single query.
  const CHUNK = 200;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK);
    const result = await prisma.word.createMany({
      data: chunk.map((it) => ({
        topicId: topic!.id,
        term: it.term,
        definition: it.definition,
        source: 'vocabulary',
      })),
      skipDuplicates: true,
    });
    inserted += result.count;
    process.stdout.write(`  · inserted ${inserted}/${toInsert.length}\r`);
  }
  console.log(`\nDone. ${inserted} terms inserted into topic "${topicName}".`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
