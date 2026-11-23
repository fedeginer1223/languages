import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// salir (fr): to dirty / ensuciar. Regular 2nd-group -ir verb (like finir).
// participe passé: sali (auxiliary: avoir)
const CONJ: Record<string, Record<string, string>> = {
  indicatif_présent: {
    'je': 'salis', 'tu': 'salis', 'il/elle': 'salit',
    'nous': 'salissons', 'vous': 'salissez', 'ils/elles': 'salissent',
  },
  indicatif_imparfait: {
    'je': 'salissais', 'tu': 'salissais', 'il/elle': 'salissait',
    'nous': 'salissions', 'vous': 'salissiez', 'ils/elles': 'salissaient',
  },
  indicatif_futur_simple: {
    'je': 'salirai', 'tu': 'saliras', 'il/elle': 'salira',
    'nous': 'salirons', 'vous': 'salirez', 'ils/elles': 'saliront',
  },
  conditionnel_présent: {
    'je': 'salirais', 'tu': 'salirais', 'il/elle': 'salirait',
    'nous': 'salirions', 'vous': 'saliriez', 'ils/elles': 'saliraient',
  },
  subjonctif_présent: {
    'je': 'salisse', 'tu': 'salisses', 'il/elle': 'salisse',
    'nous': 'salissions', 'vous': 'salissiez', 'ils/elles': 'salissent',
  },
  impératif_présent: {
    'tu': 'salis', 'nous': 'salissons', 'vous': 'salissez',
  },
  indicatif_passé_composé: {
    'je': 'ai sali', 'tu': 'as sali', 'il/elle': 'a sali',
    'nous': 'avons sali', 'vous': 'avez sali', 'ils/elles': 'ont sali',
  },
};

(async () => {
  const lang = await p.language.findFirst({ where: { name: 'Français' } });
  if (!lang) { console.log('Français language not found'); process.exit(1); }

  const existing = await p.verb.findFirst({ where: { languageId: lang.id, infinitive: 'salir' } });
  if (existing) { console.log(`salir already exists (id=${existing.id}). Aborting.`); process.exit(0); }

  const verb = await p.verb.create({ data: { infinitive: 'salir', languageId: lang.id } });
  console.log(`Created verb ${verb.infinitive} (id=${verb.id})`);

  const rows: { verbId: string; tense: string; person: string; form: string }[] = [];
  for (const [tense, byPerson] of Object.entries(CONJ)) {
    for (const [person, form] of Object.entries(byPerson)) {
      rows.push({ verbId: verb.id, tense, person, form });
    }
  }
  await p.verbConjugation.createMany({ data: rows });
  console.log(`Inserted ${rows.length} conjugations across ${Object.keys(CONJ).length} tenses.`);

  await p.$disconnect();
})();
