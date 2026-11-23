/**
 * Second English vocab import. The file has a single "term" cell with the
 * pattern "english,spanish" (delimiter is the ONE comma NOT followed by a
 * space — every row has exactly one such comma, which cleanly separates the
 * English side from the Spanish translation). The "definiton" column is empty.
 *
 * Idempotent: existing terms in the target topic are skipped.
 *
 * Usage:
 *   npx tsx scripts/importEnglishVocab2.ts [filePath] [topicName]
 */
import { PrismaClient } from '@prisma/client';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx');

const prisma = new PrismaClient();

const DEFAULT_FILE = '/Users/federicohappyrobot/Downloads/export english 2.xlsx';
const DEFAULT_TOPIC = 'Vocabulario general';

function splitTermDefinition(raw: string): { term: string; definition: string } | null {
  // Split on the first comma that is NOT followed by a space (that's the delimiter
  // between english and spanish; commas inside either side are followed by a space).
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === ',' && raw[i + 1] && raw[i + 1] !== ' ') {
      return {
        term: raw.slice(0, i).trim(),
        definition: raw.slice(i + 1).trim(),
      };
    }
  }
  return null;
}

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

  const parsed: { term: string; definition: string }[] = [];
  const bad: string[] = [];
  for (const r of rows) {
    const raw = String(r.term ?? '').trim();
    if (!raw) continue;
    const split = splitTermDefinition(raw);
    if (!split || !split.term || !split.definition) {
      bad.push(raw);
      continue;
    }
    parsed.push(split);
  }
  if (bad.length > 0) {
    console.warn(`Skipped ${bad.length} unparseable rows (first 5):`);
    bad.slice(0, 5).forEach((r) => console.warn('  ·', r));
  }

  // Dedupe by lowercased term.
  const seen = new Map<string, { term: string; definition: string }>();
  for (const r of parsed) {
    const key = r.term.toLowerCase();
    if (!seen.has(key)) seen.set(key, r);
  }
  const items = Array.from(seen.values());
  console.log(`Parsed ${rows.length} rows → ${parsed.length} usable → ${items.length} unique terms.`);

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
