// eslint-disable-next-line @typescript-eslint/no-var-requires
const FrenchVerbs = require('french-verbs');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Lefff = require('french-verbs-lefff/dist/conjugations.json');

// Verbs that use "être" as auxiliary in compound tenses (DR MRS VANDERTRAMP + reflexives)
const ETRE_VERBS = new Set([
  'aller', 'venir', 'arriver', 'partir', 'sortir', 'entrer', 'monter',
  'descendre', 'tomber', 'naître', 'mourir', 'rester', 'retourner',
  'devenir', 'revenir', 'rentrer', 'passer', 'retomber', 'apparaître',
  'parvenir', 'intervenir', 'survenir', 'advenir', 'échoir', 'décéder',
]);

// Map from our tense IDs to the library's tense names
const TENSE_MAP: Record<string, string> = {
  'indicatif_présent': 'PRESENT',
  'indicatif_imparfait': 'IMPARFAIT',
  'indicatif_passé_simple': 'PASSE_SIMPLE',
  'indicatif_futur_simple': 'FUTUR',
  'indicatif_passé_composé': 'PASSE_COMPOSE',
  'indicatif_plus_que_parfait': 'PLUS_QUE_PARFAIT',
  'indicatif_futur_antérieur': 'FUTUR_ANTERIEUR',
  'subjonctif_présent': 'SUBJONCTIF_PRESENT',
  'subjonctif_imparfait': 'SUBJONCTIF_IMPARFAIT',
  'subjonctif_passé': 'SUBJONCTIF_PASSE',
  'subjonctif_plus_que_parfait': 'SUBJONCTIF_PLUS_QUE_PARFAIT',
  'conditionnel_présent': 'CONDITIONNEL_PRESENT',
  'conditionnel_passé': 'CONDITIONNEL_PASSE_1',
  'impératif_présent': 'IMPERATIF_PRESENT',
  'impératif_passé': 'IMPERATIF_PASSE',
};

// Compound tenses that require auxiliary specification
const COMPOUND_TENSES = new Set([
  'PASSE_COMPOSE', 'PLUS_QUE_PARFAIT', 'FUTUR_ANTERIEUR',
  'SUBJONCTIF_PASSE', 'SUBJONCTIF_PLUS_QUE_PARFAIT',
  'CONDITIONNEL_PASSE_1', 'IMPERATIF_PASSE',
]);

// Person index mapping: library uses 0-5 for je/tu/il/nous/vous/ils
const PERSON_MAP: Record<string, number> = {
  'je': 0,
  'tu': 1,
  'il/elle': 2,
  'nous': 3,
  'vous': 4,
  'ils/elles': 5,
};

// Impératif only has 3 persons
const IMPERATIF_PERSONS = ['tu', 'nous', 'vous'];

// Futur proche: aller (conjugated in present) + infinitive
const ALLER_PRESENT: Record<string, string> = {
  'je': 'vais',
  'tu': 'vas',
  'il/elle': 'va',
  'nous': 'allons',
  'vous': 'allez',
  'ils/elles': 'vont',
};

function getAuxiliary(infinitive: string): 'AVOIR' | 'ETRE' {
  const base = infinitive.toLowerCase().replace(/^se\s+|^s'/, '');
  // Reflexive verbs always use être
  if (infinitive.toLowerCase().startsWith('se ') || infinitive.toLowerCase().startsWith("s'")) {
    return 'ETRE';
  }
  return ETRE_VERBS.has(base) ? 'ETRE' : 'AVOIR';
}

export function getConjugation(infinitive: string, tenseId: string, person: string): string {
  // Handle futur proche specially
  if (tenseId === 'indicatif_futur_proche') {
    const allerForm = ALLER_PRESENT[person];
    return allerForm ? `${allerForm} ${infinitive}` : infinitive;
  }

  const libraryTense = TENSE_MAP[tenseId];
  if (!libraryTense) {
    console.warn(`Unknown tense ID: ${tenseId}`);
    return infinitive;
  }

  const personIndex = PERSON_MAP[person];
  if (personIndex === undefined) {
    console.warn(`Unknown person: ${person}`);
    return infinitive;
  }

  try {
    const options = COMPOUND_TENSES.has(libraryTense)
      ? { aux: getAuxiliary(infinitive) }
      : undefined;

    return FrenchVerbs.getConjugation(Lefff, infinitive, libraryTense, personIndex, options);
  } catch (error) {
    console.warn(`Conjugation failed for ${infinitive} (${tenseId}, ${person}):`, error);
    return infinitive;
  }
}

export function getPersonsForTense(tenseId: string): string[] {
  if (tenseId === 'impératif_présent' || tenseId === 'impératif_passé') {
    return IMPERATIF_PERSONS;
  }
  return ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];
}

export function hasConjugations(infinitive: string): boolean {
  return infinitive.toLowerCase() in (Lefff as Record<string, unknown>);
}

export function getAllTenseIds(): string[] {
  return [...Object.keys(TENSE_MAP), 'indicatif_futur_proche'];
}
