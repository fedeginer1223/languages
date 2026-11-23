import fs from 'fs';
import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// Normalized candidates from the pasted notes.
// Rules: nouns with un/une (fr) + un/una (es); verbs in infinitive; expressions sin artículo.
const CANDIDATES: { fr: string; es: string }[] = [
  // Sustantivos
  { fr: 'un truc', es: 'una cosa' },
  { fr: 'un trottoir', es: 'una acera' },
  { fr: 'un cambriolage', es: 'un robo con allanamiento' },
  { fr: 'un verrou', es: 'un cerrojo' },
  { fr: 'un citron', es: 'un limón' },
  { fr: 'une glace', es: 'un helado' },
  { fr: 'un granité', es: 'un granizado' },
  { fr: 'un ascenseur', es: 'un ascensor' },
  { fr: 'une paille', es: 'una pajita' },
  { fr: 'un plafond', es: 'un techo' },
  { fr: 'une attente', es: 'una expectativa' },
  { fr: 'une claque', es: 'una bofetada' },
  { fr: 'un cercueil', es: 'un ataúd' },
  { fr: 'une pomme de pin', es: 'una piña (de pino)' },
  { fr: 'une pelouse', es: 'un césped' },
  { fr: 'un chardon', es: 'un cardo' },
  { fr: 'un fumoir', es: 'un fumador (sala)' },
  { fr: 'une enchère', es: 'una puja' },
  { fr: 'un équipage', es: 'una tripulación' },
  { fr: 'une revanche', es: 'una revancha' },

  // Adjetivos
  { fr: 'faible', es: 'débil' },
  { fr: 'flippant', es: 'acojonante / que da miedo' },
  { fr: 'troublant', es: 'inquietante' },
  { fr: 'encerclé', es: 'rodeado' },
  { fr: 'rescapé', es: 'superviviente' },
  { fr: 'écorché vif', es: 'desollado vivo' },

  // Verbos (infinitivo)
  { fr: 'embrouiller', es: 'embrollar / marear' },
  { fr: 'bousiller', es: 'destrozar / arruinar' },
  { fr: 'braquer', es: 'atracar / apuntar con arma' },
  { fr: 'bloquer', es: 'bloquear / detener' },
  { fr: 'échouer', es: 'fracasar' },
  { fr: 'traverser', es: 'cruzar' },
  { fr: 'pousser', es: 'empujar' },
  { fr: 'décoller', es: 'despegar' },
  { fr: 's\'ennuyer', es: 'aburrirse' },
  { fr: 'déranger', es: 'molestar' },
  { fr: 'se plaindre', es: 'quejarse' },
  { fr: 'se calmer', es: 'calmarse' },
  { fr: 'blesser', es: 'herir / ofender' },
  { fr: 'croiser les doigts', es: 'cruzar los dedos' },
  { fr: 'faillir', es: 'estar a punto de / casi (hacer)' },
  { fr: 'posséder', es: 'poseer' },
  { fr: 'démissionner', es: 'dimitir' },
  { fr: 'détourner l\'attention', es: 'distraer la atención' },
  { fr: 'appartenir à', es: 'pertenecer a' },
  { fr: 'acquérir', es: 'adquirir' },
  { fr: 'traîner', es: 'ir despacio / tardar' },
  { fr: 'se pendre', es: 'ahorcarse' },
  { fr: 'enlever', es: 'secuestrar / quitar' },
  { fr: 'débarrasser la table', es: 'recoger la mesa' },
  { fr: 'marquer un but', es: 'marcar un gol' },
  { fr: 'vouloir à quelqu\'un', es: 'tener manía a alguien' },
  { fr: 'se prendre la tête', es: 'calentarse la cabeza / cabrearse' },
  { fr: 'faire à l\'envers', es: 'estafar / engañar' },
  { fr: 'rendre triste', es: 'entristecer' },
  { fr: 'prendre du recul', es: 'tomar perspectiva' },

  // Expresiones / adverbios
  { fr: 'peu importe', es: 'no importa / da igual' },
  { fr: 'je m\'en fous', es: 'me da igual' },
  { fr: 'je t\'en prie', es: 'te lo ruego / de nada' },
  { fr: 'tout de suite', es: 'en seguida / ahora' },
  { fr: 'compris', es: 'incluido' },
  { fr: 'enfin', es: 'por fin / en fin' },
  { fr: 'à emporter', es: 'para llevar' },
  { fr: 'à lundi', es: 'hasta el lunes' },
  { fr: 'qui sait', es: 'quién sabe' },
  { fr: 'un tout petit peu', es: 'un poquito' },
  { fr: 'là où', es: 'allí donde / donde' },
  { fr: 'qu\'est-ce qui t\'amène', es: '¿qué te trae por aquí?' },
  { fr: 'bonne route', es: 'buen viaje' },
  { fr: 'un coup propre', es: 'un golpe limpio' },
  { fr: 'ne sert à rien', es: 'no sirve de nada' },
];

function normKey(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/^(un |une |le |la |les |l'|des |d')/, '') // strip articles
    .replace(/[\s'\-]/g, '')
    .replace(/[^\w]/g, '');
}

(async () => {
  const raw = fs.readFileSync('/tmp/fr_vocab.tsv', 'utf-8').split('\n').filter(Boolean);
  const existingByKey = new Map<string, { term: string; def: string; topic: string }>();
  for (const line of raw) {
    const [term, def, topic] = line.split('\t');
    existingByKey.set(normKey(term), { term, def, topic });
  }

  const toUpload: typeof CANDIDATES = [];
  const alreadyIn: { c: typeof CANDIDATES[0]; existing: { term: string; def: string; topic: string } }[] = [];
  for (const c of CANDIDATES) {
    const k = normKey(c.fr);
    const match = existingByKey.get(k);
    if (match) alreadyIn.push({ c, existing: match });
    else toUpload.push(c);
  }

  console.log(`\n=== YA EN LA BD (${alreadyIn.length}) ===`);
  for (const a of alreadyIn) {
    console.log(`  ${a.c.fr.padEnd(32)} → ya existe como "${a.existing.term}" (${a.existing.topic})`);
  }
  console.log(`\n=== A SUBIR (${toUpload.length}) ===`);
  console.log('term,definition');
  for (const c of toUpload) {
    const term = c.fr.includes(',') ? `"${c.fr}"` : c.fr;
    const def = c.es.includes(',') ? `"${c.es}"` : c.es;
    console.log(`${term},${def}`);
  }
})().finally(() => p.$disconnect());
