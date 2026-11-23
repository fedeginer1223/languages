/**
 * Applies a curated set of grammar fixes to French structure examples that
 * were flagged as broken by reviewFrenchStructureExamples. Only the fixes I
 * verified manually are here — the AI's false positives are excluded.
 *
 *   npx tsx scripts/applyStructureFixes.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Each fix: locate by (pattern, spanish prompt), replace `text` with `newText`.
const FIXES: { pattern: string; spanish: string; newText: string }[] = [
  // ---- quitte à faire de ___ ----
  { pattern: 'quitte à faire de ___',
    spanish: 'Si voy a estudiar medicina, mejor empiezo ahora mismo.',
    newText: "Quitte à faire des études de médecine, autant commencer tout de suite." },
  { pattern: 'quitte à faire de ___',
    spanish: 'Si vamos a hacer un viaje, hagámoslo en verano.',
    newText: "Quitte à faire un voyage, faisons-le en été." },
  { pattern: 'quitte à faire de ___',
    spanish: 'Si vamos a pedir un aumento, que sea una cantidad decente.',
    newText: "Quitte à faire une demande d'augmentation, que ce soit un montant correct." },

  // ---- ___ dont ___ ---- (manual fix — better than the AI's proposal)
  { pattern: '___ dont ___',
    spanish: 'La razón por la que se fue es la que nadie comprende.',
    newText: "C'est un départ dont personne ne comprend les raisons." },

  // ---- Je ___ bien ----
  { pattern: 'Je ___ bien',
    spanish: 'Habla bien el español, apenas tiene acento.',
    newText: "Je trouve qu'il parle bien l'espagnol, il a à peine un accent." },

  // ---- au delà de ___  (all 5: missing hyphen) ----
  { pattern: 'au delà de ___',
    spanish: 'Más allá de las montañas, hay ciudades que nunca hemos visitado.',
    newText: "Au-delà des montagnes, il y a des villes que nous n'avons jamais visitées." },
  { pattern: 'au delà de ___',
    spanish: 'Además de su talento, admiro su dedicación al trabajo.',
    newText: "Au-delà de son talent, j'admire son dévouement au travail." },
  { pattern: 'au delà de ___',
    spanish: 'Pasada la medianoche, el restaurante cierra sus puertas.',
    newText: "Au-delà de minuit, le restaurant ferme ses portes." },
  { pattern: 'au delà de ___',
    spanish: 'Más allá de lo que imaginaba, el proyecto fue un éxito completo.',
    newText: "Au-delà de ce que j'imaginais, le projet a été un succès complet." },
  { pattern: 'au delà de ___',
    spanish: 'Fuera de nuestros presupuestos, no podemos comprar esa casa.',
    newText: "Au-delà de notre budget, nous ne pouvons pas acheter cette maison." },

  // ---- on marche sur la ___ ----
  { pattern: 'on marche sur la ___',
    spanish: 'El negocio está en una posición muy arriesgada ahora.',
    newText: "En ce moment, on marche sur des œufs avec l'affaire." },

  // ---- rester de ___ (idiomatic: rester de marbre) ----
  { pattern: 'rester de ___',
    spanish: 'Los turistas quedaron petrificados al ver el tamaño del acantilado.',
    newText: "Les touristes sont restés de marbre en voyant la taille de la falaise." },
  { pattern: 'rester de ___',
    spanish: 'El público entero se quedó inmóvil durante el minuto de silencio.',
    newText: "Le public entier est resté de marbre pendant la minute de silence." },
  { pattern: 'rester de ___',
    spanish: 'Mi jefe quedó sin habla cuando le mostré los resultados finales.',
    newText: "Mon patron est resté de marbre quand je lui ai montré les résultats finaux." },

  // ---- Je suis mitigé ----
  { pattern: 'Je suis mitigé',
    spanish: 'La película tiene buenos actores, aunque la historia es débil.',
    newText: "Je suis mitigé concernant ce film." },

  // ---- à demi-mot ----
  { pattern: 'à demi-mot',
    spanish: 'Mi jefe me sugirió a duras penas que debería buscar otro empleo.',
    newText: "Mon chef m'a suggéré à demi-mot de chercher un autre emploi." },

  // ---- ça fait ___ (add missing "ne") ----
  { pattern: 'ça fait ___',
    spanish: 'No me parece bien que llegues tan tarde.',
    newText: "Ça ne fait pas bien que tu arrives si tard." },

  // ---- dès que possible ----
  { pattern: 'dès que possible',
    spanish: 'El médico dijo que visite al especialista cuanto antes.',
    newText: "Le médecin a dit que je devais consulter le spécialiste dès que possible." },
];

async function main() {
  const language = await prisma.language.findUnique({ where: { code: 'fr' } });
  if (!language) { console.error('French language not found'); process.exit(1); }

  let ok = 0;
  const failed: string[] = [];
  for (const fx of FIXES) {
    const structure = await prisma.structure.findFirst({
      where: { languageId: language.id, pattern: fx.pattern },
    });
    if (!structure) { failed.push(`no structure with pattern "${fx.pattern}"`); continue; }
    const example = await prisma.structureExample.findFirst({
      where: { structureId: structure.id, spanish: fx.spanish },
    });
    if (!example) { failed.push(`no example for "${fx.pattern}" / "${fx.spanish}"`); continue; }
    if (example.text === fx.newText) { console.log(`  = already correct: ${fx.pattern} / ${fx.spanish}`); ok++; continue; }
    console.log(`  ✏ ${fx.pattern} / "${fx.spanish}"\n      antes: "${example.text}"\n      ahora: "${fx.newText}"`);
    await prisma.structureExample.update({ where: { id: example.id }, data: { text: fx.newText } });
    ok++;
  }

  // Also fix the pattern spelling: "au delà de ___" → "au-delà de ___"
  const badPattern = await prisma.structure.findFirst({
    where: { languageId: language.id, pattern: 'au delà de ___' },
  });
  if (badPattern) {
    console.log('  ✏ Actualizando pattern "au delà de ___" → "au-delà de ___"');
    await prisma.structure.update({
      where: { id: badPattern.id },
      data: { pattern: 'au-delà de ___' },
    });
    ok++;
  }

  console.log(`\nApplied ${ok} fixes.`);
  if (failed.length) {
    console.log('Failed:'); failed.forEach((f) => console.log('  -', f));
  }
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
