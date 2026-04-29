import { prisma } from '../utils/prisma';
import { CreateVerbDto } from '../types';
import { calculateSuccessRate, validateAnswer } from '../utils/validation';
import { getConjugation, getPersonsForTense, hasConjugations } from '../utils/frenchConjugations';

// Common French verbs database
const FRENCH_VERBS_DB = [
  'être', 'avoir', 'faire', 'dire', 'aller', 'voir', 'savoir', 'pouvoir', 'vouloir', 'venir',
  'falloir', 'devoir', 'croire', 'trouver', 'donner', 'prendre', 'parler', 'aimer', 'passer', 'mettre',
  'demander', 'tenir', 'sembler', 'laisser', 'rester', 'penser', 'entendre', 'regarder', 'répondre', 'rendre',
  'connaître', 'comprendre', 'porter', 'montrer', 'continuer', 'suivre', 'vivre', 'sortir', 'partir', 'arriver',
  'attendre', 'garder', 'reprendre', 'servir', 'sentir', 'perdre', 'recevoir', 'permettre', 'chercher', 'devenir',
  'écrire', 'appeler', 'jouer', 'tourner', 'agir', 'ouvrir', 'présenter', 'reconnaître', 'lever', 'paraître',
  'tomber', 'courir', 'tirer', 'mourir', 'manger', 'commencer', 'finir', 'changer', 'marcher', 'dormir',
  'apprendre', 'entrer', 'espérer', 'exister', 'rencontrer', 'occuper', 'obtenir', 'descendre', 'monter',
  'rappeler', 'envoyer', 'accepter', 'refuser', 'choisir', 'naître', 'étudier', 'lire', 'boire', 'conduire',
  'compter', 'acheter', 'vendre', 'couvrir', 'oublier', 'crier', 'revenir', 'appartenir', 'souffrir', 'offrir',
  'avoiner', 'avoiser', 'avoisiner', 'battre', 'bâtir', 'casser', 'causer', 'céder', 'cesser', 'coucher',
  'danser', 'débuter', 'déjeuner', 'demeurer', 'dessiner', 'dîner', 'douter', 'durer', 'échapper', 'éclairer',
  'écouter', 'élever', 'empêcher', 'employer', 'emporter', 'enseigner', 'entretenir', 'éprouver', 'établir',
  'éviter', 'exprimer', 'figurer', 'former', 'frapper', 'glisser', 'grandir', 'habiter', 'hésiter', 'imaginer',
  'importer', 'imposer', 'indiquer', 'intéresser', 'jeter', 'joindre', 'jurer', 'jurer', 'lancer', 'laver',
  'manquer', 'mener', 'mériter', 'mesurer', 'mêler', 'nommer', 'noter', 'nourrir', 'obliger', 'observer',
  'ordonner', 'organiser', 'oser', 'parcourir', 'parvenir', 'peindre', 'pencher', 'pendre', 'placer', 'plaindre',
  'plaire', 'pleurer', 'pleuvoir', 'plonger', 'posséder', 'poser', 'pousser', 'préférer', 'préparer', 'presser',
  'prier', 'produire', 'promettre', 'proposer', 'protéger', 'prouver', 'publier', 'punir', 'quitter', 'raconter',
  'ramener', 'ramasser', 'ranger', 'rappeler', 'rapporter', 'rassurer', 'réaliser', 'recommencer', 'réduire',
  'refuser', 'regarder', 'regretter', 'rejeter', 'rejoindre', 'relever', 'remarquer', 'remettre', 'remplacer',
  'remplir', 'rencontrer', 'rentrer', 'renverser', 'répéter', 'reposer', 'représenter', 'reproduire', 'résoudre',
  'ressembler', 'retenir', 'retirer', 'retomber', 'retourner', 'retrouver', 'réunir', 'réussir', 'réveiller',
  'révéler', 'revenir', 'rêver', 'revoir', 'rire', 'risquer', 'rompre', 'rouler', 'rouvrir', 's\'agir',
  's\'approcher', 's\'arrêter', 's\'asseoir', 's\'avancer', 's\'éloigner', 's\'endormir', 's\'enfuir',
  's\'ennuyer', 's\'inquiéter', 's\'occuper', 's\'ouvrir', 's\'écrier', 'saisir', 'saluer', 'satisfaire',
  'sauver', 'secouer', 'sécher', 'séduire', 'séparer', 'serrer', 'signaler', 'signifier', 'soigner', 'songer',
  'sonner', 'souhaiter', 'soulever', 'soumettre', 'sourire', 'soutenir', 'souvenir', 'subir', 'succéder',
  'suffire', 'supplier', 'supporter', 'supposer', 'surprendre', 'survivre', 'taire', 'taper', 'tendre', 'terminer',
  'tirer', 'toucher', 'traîner', 'traiter', 'transformer', 'transporter', 'traverser', 'trembler', 'tromper',
  'troubler', 'trouver', 'tuer', 'user', 'utiliser', 'vaincre', 'valoir', 'vendre', 'verser', 'vêtir', 'visiter',
  'voler', 'voter'
].sort();

export const verbService = {
  async searchVerbs(query: string, language: string = 'french'): Promise<string[]> {
    // Search in local database
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery || normalizedQuery.length < 2) {
      return [];
    }

    const matches = FRENCH_VERBS_DB.filter(verb =>
      verb.toLowerCase().startsWith(normalizedQuery)
    );

    return matches.slice(0, 10);
  },

  async getByLanguageId(languageId: string) {
    return prisma.verb.findMany({
      where: { languageId },
      include: {
        conjugations: {
          orderBy: [{ tense: 'asc' }, { person: 'asc' }],
        },
      },
      orderBy: { infinitive: 'asc' },
    });
  },

  async getById(id: string) {
    const verb = await prisma.verb.findUnique({
      where: { id },
      include: {
        conjugations: {
          orderBy: [{ tense: 'asc' }, { person: 'asc' }],
        },
        language: true,
      },
    });

    if (!verb) {
      throw new Error('Verb not found');
    }

    return verb;
  },

  async create(languageId: string, data: CreateVerbDto) {
    // Generate conjugations from selected tenses
    const conjugations: { tense: string; person: string; form: string }[] = [];

    if (data.tenses && data.tenses.length > 0) {
      for (const tense of data.tenses) {
        const persons = getPersonsForTense(tense);
        for (const person of persons) {
          const form = getConjugation(data.infinitive, tense, person);
          conjugations.push({ tense, person, form });
        }
      }
    } else if (data.conjugations) {
      // Legacy: replace placeholders with real conjugations
      for (const conj of data.conjugations) {
        if (conj.form === '[pendiente]' || !conj.form) {
          conjugations.push({
            ...conj,
            form: getConjugation(data.infinitive, conj.tense, conj.person),
          });
        } else {
          conjugations.push(conj);
        }
      }
    }

    return prisma.verb.create({
      data: {
        infinitive: data.infinitive,
        languageId,
        conjugations: {
          create: conjugations,
        },
      },
      include: {
        conjugations: true,
      },
    });
  },

  async update(id: string, data: Partial<CreateVerbDto>) {
    return prisma.verb.update({
      where: { id },
      data: {
        infinitive: data.infinitive,
      },
    });
  },

  async delete(id: string) {
    return prisma.verb.delete({
      where: { id },
    });
  },

  async getPracticeQuestions(verbId: string, tenses?: string[]) {
    const verb = await prisma.verb.findUnique({
      where: { id: verbId },
      include: {
        conjugations: {
          where: tenses ? { tense: { in: tenses } } : undefined,
          orderBy: [
            { successRate: 'asc' },
            { attempts: 'asc' },
          ],
        },
      },
    });

    if (!verb) {
      throw new Error('Verb not found');
    }

    return {
      verbId: verb.id,
      infinitive: verb.infinitive,
      questions: verb.conjugations.map((c) => ({
        conjugationId: c.id,
        tense: c.tense,
        person: c.person,
        prompt: `${verb.infinitive} (${c.tense}, ${c.person})`,
      })),
    };
  },

  async validateConjugation(conjugationId: string, answer: string) {
    const conjugation = await prisma.verbConjugation.findUnique({
      where: { id: conjugationId },
    });

    if (!conjugation) {
      throw new Error('Conjugation not found');
    }

    const correct = validateAnswer(answer, conjugation.form);

    const newAttempts = conjugation.attempts + 1;
    const newCorrectCount = correct
      ? conjugation.correctCount + 1
      : conjugation.correctCount;
    const newSuccessRate = calculateSuccessRate(newCorrectCount, newAttempts);

    const updated = await prisma.verbConjugation.update({
      where: { id: conjugationId },
      data: {
        attempts: newAttempts,
        correctCount: newCorrectCount,
        successRate: newSuccessRate,
      },
    });

    return {
      correct,
      expectedAnswer: conjugation.form,
      explanation: correct ? null : `La respuesta correcta es "${conjugation.form}"`,
      stats: {
        attempts: updated.attempts,
        correctCount: updated.correctCount,
        successRate: updated.successRate,
      },
    };
  },
};
