/**
 * Reviews every French structure example for grammatical correctness given the
 * structure's pattern. Uses a stronger AI model (Sonnet 4.5) with a strict prompt
 * that both (a) validates the grammar of the target French sentence, and (b)
 * verifies that the sentence actually uses the pattern correctly.
 *
 * By default runs in --dry-run mode: prints every diagnosed problem and its
 * proposed fix, but does not touch the DB. Pass --apply to persist the fixes.
 *
 * Usage:
 *   npx tsx scripts/reviewFrenchStructureExamples.ts                # dry run
 *   npx tsx scripts/reviewFrenchStructureExamples.ts --apply        # write fixes
 *   npx tsx scripts/reviewFrenchStructureExamples.ts --only "dont"  # single structure by pattern substring
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-5-20250929';
const prisma = new PrismaClient();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Verdict {
  index: number;      // 1-based index into the input list
  isCorrect: boolean;
  reason: string;     // brief: what's wrong (if !isCorrect)
  corrected: string | null; // grammatically-perfect French sentence, keeping the same meaning + using the pattern
}

function safeJsonParse<T>(raw: string): T | null {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned) as T; } catch {}
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]) as T; } catch {} }
  return null;
}

async function reviewStructure(
  pattern: string,
  category: string,
  examples: { id: string; spanish: string; french: string }[]
): Promise<Verdict[]> {
  const numbered = examples
    .map((e, i) => `${i + 1}. ES: "${e.spanish}"\n   FR: "${e.french}"`)
    .join('\n');

  const prompt = `Eres un revisor gramatical de francés de nivel avanzado. Tu única tarea es identificar errores gramaticales o usos incorrectos del PATRÓN objetivo en oraciones ejemplo.

PATRÓN OBJETIVO: "${pattern}"
CATEGORÍA: ${category}

EJEMPLOS (español = prompt, francés = referencia a validar):
${numbered}

REGLAS ESTRICTAS:
- Cada ejemplo debe ser GRAMATICALMENTE PERFECTO en francés (conjugación, concordancia, uso de "de/à", modo, tiempo, orden de palabras). No hay tolerancia.
- Cada ejemplo debe USAR el patrón "${pattern}" CORRECTAMENTE en su semántica y sintaxis:
  · Ejemplo crítico: si el patrón es "dont", el antecedente TIENE que ser complemento de un verbo/adjetivo/nombre construido con "de" (verbe + de, avoir besoin de, être fier de, l'auteur de, etc.). "dont personne ne comprend" ES INCORRECTO porque "comprendre" no lleva "de" (sería "que personne ne comprend"). El uso correcto sería "dont personne ne comprend la raison" (comprendre la raison → complement) o mejor un verbo con de como "dont personne ne parle" o "dont tout le monde a peur".
  · Si el patrón usa "duquel/de laquelle/desquels/desquelles", el antecedente debe ser una localización o un nombre precedido de preposición compuesta con "de" ("à côté de", "au sujet de"...), NUNCA sinónimo de "dont" con verbos ordinarios.
  · Si el patrón involucra subjuntivo (bien que, pour que, avant que, à moins que), el verbo debe estar en subjonctif.
  · Si es "à condition que" o "à moins que", subjonctif.
  · Concordancia participio pasé según auxiliar (avoir/être) y COD antepuesto.
- Si detectas CUALQUIER error, propón una corrección MÍNIMA que mantenga la intención del español y use el patrón bien. Si el francés está bien pero no usa el patrón, corrígelo para que sí lo use.
- Si tienes duda razonable, marca isCorrect=false y explica.
- Los ejemplos españoles NO los evalúes ni cambies.

Responde SOLO con este JSON, sin markdown ni texto extra:
{"verdicts": [
  {"index": 1, "isCorrect": true|false, "reason": "…breve…", "corrected": "…frase francesa corregida…" o null si ya está bien}
]}`;

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content[0].type === 'text' ? res.content[0].text : '';
  const parsed = safeJsonParse<{ verdicts: Verdict[] }>(text);
  if (!parsed || !Array.isArray(parsed.verdicts)) {
    throw new Error(`AI did not return usable verdicts: ${text.slice(0, 200)}`);
  }
  return parsed.verdicts;
}

async function main() {
  const apply = process.argv.includes('--apply');
  const onlyIdx = process.argv.indexOf('--only');
  const onlyFilter = onlyIdx >= 0 ? process.argv[onlyIdx + 1]?.toLowerCase() ?? null : null;

  const language = await prisma.language.findUnique({ where: { code: 'fr' } });
  if (!language) { console.error('French language not found.'); process.exit(1); }

  const structuresRaw = await prisma.structure.findMany({
    where: { languageId: language.id },
    include: { examples: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });
  const structures = onlyFilter
    ? structuresRaw.filter((s) => s.pattern.toLowerCase().includes(onlyFilter))
    : structuresRaw;

  console.log(`Reviewing ${structures.length} structure(s) — ${apply ? 'APPLY MODE (will update DB)' : 'DRY RUN'}`);
  if (onlyFilter) console.log(`  filter: pattern contains "${onlyFilter}"`);

  let totalExamples = 0;
  let totalIssues = 0;
  const allFixes: { pattern: string; spanish: string; before: string; after: string; reason: string; exampleId: string }[] = [];

  for (const s of structures) {
    const examples = s.examples
      .filter((e) => (e.spanish ?? '').trim().length > 0 && (e.text ?? '').trim().length > 0)
      .map((e) => ({ id: e.id, spanish: e.spanish!, french: e.text }));
    if (examples.length === 0) continue;
    totalExamples += examples.length;

    process.stdout.write(`\n[${s.pattern}] ${examples.length} ejemplos… `);
    let verdicts: Verdict[];
    try {
      verdicts = await reviewStructure(s.pattern, s.category, examples);
    } catch (e) {
      console.log(`FAIL — ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }

    let issuesHere = 0;
    for (const v of verdicts) {
      const ex = examples[v.index - 1];
      if (!ex) continue;
      if (v.isCorrect) continue;
      issuesHere++;
      totalIssues++;
      const fixed = (v.corrected ?? '').trim();
      const beforeAfter = { pattern: s.pattern, spanish: ex.spanish, before: ex.french, after: fixed, reason: v.reason, exampleId: ex.id };
      allFixes.push(beforeAfter);
      console.log(`\n  ⚠ #${v.index} ES: "${ex.spanish}"`);
      console.log(`     FR (mal): "${ex.french}"`);
      console.log(`     Razón:    ${v.reason}`);
      if (fixed) console.log(`     Corregido: "${fixed}"`);
      else console.log(`     (sin corrección propuesta)`);
    }
    if (issuesHere === 0) process.stdout.write('OK');
  }

  console.log(`\n\n===== Resumen =====`);
  console.log(`Total ejemplos revisados: ${totalExamples}`);
  console.log(`Ejemplos con problemas:   ${totalIssues}`);

  if (!apply) {
    console.log('\n(Dry run — no se ha modificado nada. Ejecuta con --apply para persistir las correcciones.)');
    await prisma.$disconnect();
    return;
  }

  // Apply: update only those with a non-empty corrected sentence
  let updated = 0;
  for (const fx of allFixes) {
    if (!fx.after) continue;
    await prisma.structureExample.update({
      where: { id: fx.exampleId },
      data: { text: fx.after },
    });
    updated++;
  }
  console.log(`Actualizados en DB: ${updated}/${allFixes.length}`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
