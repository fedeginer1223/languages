/**
 * Regenerate translation examples (spanish → target) for every structure of a
 * given language. Uses the AI to produce N grammatically-correct examples per
 * structure and replaces the existing examples wholesale.
 *
 * Usage:
 *   npx tsx scripts/regenerateStructureExamples.ts <languageCode> [count]
 * Example:
 *   npx tsx scripts/regenerateStructureExamples.ts fr 5
 *
 * Requires ANTHROPIC_API_KEY in backend/.env.
 */
import { PrismaClient } from '@prisma/client';
import 'dotenv/config';
import { structureAiService } from '../src/services/structureAiService';

const prisma = new PrismaClient();

async function main() {
  const code = process.argv[2];
  const defaultCount = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
  if (!code) {
    console.error('Usage: npx tsx scripts/regenerateStructureExamples.ts <languageCode> [count]');
    process.exit(1);
  }

  const language = await prisma.language.findUnique({ where: { code } });
  if (!language) {
    console.error(`Language with code "${code}" not found.`);
    process.exit(1);
  }

  const structures = await prisma.structure.findMany({
    where: { languageId: language.id },
    include: { examples: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log(`Regenerating examples for ${structures.length} structure(s) in ${language.name}…`);

  let ok = 0;
  let failed: string[] = [];
  for (const s of structures) {
    const count = defaultCount ?? s.exampleCount ?? 5;
    process.stdout.write(`  · ${s.pattern.padEnd(48).slice(0, 48)}  → ${count}… `);
    try {
      const seedExamples = s.examples.map((e) => e.text).filter((t) => t.length > 0);
      const generated = await structureAiService.generateExamples({
        languageName: language.name,
        pattern: s.pattern,
        category: s.category,
        count,
        seedExamples: seedExamples.length > 0 ? seedExamples : undefined,
      });
      await prisma.structureExample.deleteMany({ where: { structureId: s.id } });
      await prisma.structureExample.createMany({
        data: generated.map((e, i) => ({
          structureId: s.id,
          text: e.target,
          spanish: e.spanish,
          order: i,
        })),
      });
      await prisma.structure.update({
        where: { id: s.id },
        data: { exampleCount: count },
      });
      console.log(`OK (${generated.length})`);
      ok++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL — ${msg}`);
      failed.push(`${s.pattern}: ${msg}`);
    }
  }

  console.log(`\nDone. ${ok}/${structures.length} regenerated.`);
  if (failed.length > 0) {
    console.log('Failures:');
    for (const f of failed) console.log('  -', f);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
