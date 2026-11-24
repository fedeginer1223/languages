import 'dotenv/config';
import { prisma } from '../src/utils/prisma';
import { structureAiService } from '../src/services/structureAiService';

async function main() {
  const structure = await prisma.structure.findFirst({
    where: { language: { name: 'Français' }, examples: { some: { spanish: { not: null } } } },
    include: { examples: { orderBy: { order: 'asc' } } },
  });
  if (!structure) throw new Error('No French structure with a Spanish prompt found');
  const ex = structure.examples.find((e) => (e.spanish ?? '').trim());
  if (!ex) throw new Error('no example');
  console.log('PATTERN:', structure.pattern);
  console.log('SPANISH:', ex.spanish);
  console.log('REFERENCE:', ex.text);
  const others = structure.examples.filter((e) => e.id !== ex.id).map((e) => e.text).slice(0, 4);

  // Hand-written French cases built from the first example of the first French structure
  // ("avoir d'autres chats à fouetter" / "Ça ne m'inquiète pas beaucoup. J'ai d'autres chats à fouetter.").
  const ref = ex.text;
  if (ref !== "Ça ne m'inquiète pas beaucoup. J'ai d'autres chats à fouetter.") {
    console.warn('WARNING: reference differs from the one the cases were written for; cases may not match expectations.');
  }
  const cases: { name: string; answer: string }[] = [
    { name: 'exact match (curly apostrophes, no final period)', answer: ref.replace(/'/g, '\u2019').replace(/\.$/, '') },
    { name: 'valid paraphrase using the pattern', answer: "Ça ne me dérange pas trop. Moi, j'ai d'autres chats à fouetter." },
    { name: 'almost: accents missing', answer: "Ca ne m'inquiete pas beaucoup. J'ai d'autres chats à fouetter." },
    { name: 'almost: wrong agreement', answer: "Ça ne m'inquiètent pas beaucoup. J'ai d'autres chats à fouetter." },
    { name: 'invalid: pattern not used', answer: "Ça ne m'inquiète pas beaucoup. J'ai des choses plus importantes à faire." },
    { name: 'invalid: opposite meaning', answer: "Ça m'inquiète énormément. J'ai d'autres chats à fouetter." },
  ];
  let ok = 0;
  for (const c of cases) {
    const r = await structureAiService.judgeTranslation({
      languageName: 'Français', pattern: structure.pattern, spanish: ex.spanish!, reference: ref, otherExamples: others, userResponse: c.answer,
    });
    ok++;
    console.log(`\n[${c.name}]\n  answer: ${c.answer}\n  ->`, JSON.stringify(r));
  }
  console.log('\ncases run:', ok);
}
main().catch((e) => { console.error(e?.message ?? e); process.exit(1); }).finally(() => prisma.$disconnect());
