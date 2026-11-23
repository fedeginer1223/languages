/**
 * One-shot seed: imports a curated set of French verbs into the language with
 * code 'fr'. Each verb is created with its conjugations for these tenses:
 *   - Indicatif: présent, imparfait, futur simple, passé composé
 *   - Subjonctif: présent
 *   - Conditionnel: présent
 *   - Impératif: présent
 *
 * Idempotent: skips any verb whose infinitive already exists for that language.
 *
 *   npx tsx scripts/seedFrenchVerbs.ts
 */
import { PrismaClient } from '@prisma/client';
import { getConjugation, getPersonsForTense } from '../src/utils/frenchConjugations';

const prisma = new PrismaClient();

const VERBS: string[] = [
  'offrir', 'connaître', 'dire', 'décéder', 'finir', 'permettre', 'nettoyer',
  'envoyer', "s'asseoir", 'craindre', 'produire', 'voir', 'valoir', 'tenir',
  'recevoir', 'mourir', 'falloir', 'venir', 'faire', 'devoir', 'courir',
  'savoir', 'vouloir', 'entendre', 'prendre', 'servir', 'avoir', 'être',
  'sentir', 'sortir', 'dormir', 'mettre',
];

const TENSES: string[] = [
  'indicatif_présent',
  'indicatif_imparfait',
  'indicatif_futur_simple',
  'indicatif_passé_composé',
  'subjonctif_présent',
  'conditionnel_présent',
  'impératif_présent',
];

async function main() {
  const language = await prisma.language.findUnique({ where: { code: 'fr' } });
  if (!language) {
    console.error('Language with code "fr" not found. Create it first.');
    process.exit(1);
  }

  console.log(`Seeding ${VERBS.length} verbs into ${language.name} with ${TENSES.length} tenses each…`);
  let created = 0;
  let skipped = 0;
  const failed: string[] = [];

  for (const infinitive of VERBS) {
    process.stdout.write(`  · ${infinitive.padEnd(14)} `);
    try {
      // Skip if this verb already exists for the language
      const existing = await prisma.verb.findFirst({
        where: { languageId: language.id, infinitive },
      });
      if (existing) {
        console.log('skip (existe)');
        skipped++;
        continue;
      }

      const conjugations: { tense: string; person: string; form: string }[] = [];
      for (const tense of TENSES) {
        const persons = getPersonsForTense(tense);
        for (const person of persons) {
          let form = '';
          try {
            form = getConjugation(infinitive, tense, person);
          } catch {
            form = '';
          }
          if (!form || form === infinitive) {
            // fall back to a placeholder so the row exists; user can edit
            form = '';
          }
          conjugations.push({ tense, person, form });
        }
      }
      const usable = conjugations.filter((c) => c.form.length > 0);
      if (usable.length === 0) {
        console.log(`FAIL — no se pudieron generar conjugaciones`);
        failed.push(infinitive);
        continue;
      }

      await prisma.verb.create({
        data: {
          infinitive,
          languageId: language.id,
          conjugations: { create: usable },
        },
      });
      console.log(`OK (${usable.length}/${conjugations.length} conjugaciones)`);
      created++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`FAIL — ${msg}`);
      failed.push(infinitive);
    }
  }

  console.log(`\nDone. ${created} creados, ${skipped} ya existían, ${failed.length} fallidos.`);
  if (failed.length > 0) {
    console.log('Fallidos:', failed.join(', '));
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
