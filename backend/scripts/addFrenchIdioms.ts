import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

interface Idiom {
  pattern: string;
  category: string;
  examples: { fr: string; es: string }[];
}

// 21 expresiones idiomáticas del francés cotidiano. Cada una con 4–6 ejemplos
// realistas, corregidos gramaticalmente y con traducción natural al español.
// Los ejemplos preservan el sentido cultural: p.ej. "mettre son grain de sel"
// = meter baza (no "aportar granito de arena").
const IDIOMS: Idiom[] = [
  {
    pattern: 'donner un coup de main',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Je vais donner un coup de main à mon frère pour son déménagement.', es: 'Voy a echar una mano a mi hermano con la mudanza.' },
      { fr: 'Tu peux me donner un coup de main avec ces cartons ?', es: '¿Me puedes echar una mano con estas cajas?' },
      { fr: 'Elle a toujours donné un coup de main aux voisins.', es: 'Ella siempre ha echado una mano a los vecinos.' },
      { fr: 'Merci de m\'avoir donné un coup de main hier.', es: 'Gracias por haberme echado una mano ayer.' },
      { fr: 'Si tu as besoin, je peux te donner un coup de main ce week-end.', es: 'Si lo necesitas, puedo echarte una mano este fin de semana.' },
    ],
  },
  {
    pattern: 'tomber dans les pommes',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Il a tellement eu chaud qu\'il est tombé dans les pommes.', es: 'Tuvo tanto calor que se desmayó.' },
      { fr: 'Elle est tombée dans les pommes en voyant le sang.', es: 'Se desmayó al ver la sangre.' },
      { fr: 'S\'il ne mange pas rapidement, il va tomber dans les pommes.', es: 'Si no come rápido, se va a desmayar.' },
      { fr: 'J\'ai failli tomber dans les pommes pendant la conférence.', es: 'Casi me desmayo durante la conferencia.' },
      { fr: 'Après trois heures debout au soleil, elle est tombée dans les pommes.', es: 'Después de tres horas de pie al sol, se desmayó.' },
    ],
  },
  {
    pattern: 'avoir le cafard',
    category: 'estados-de-animo',
    examples: [
      { fr: 'En hiver, beaucoup de gens ont le cafard.', es: 'En invierno, mucha gente tiene bajón.' },
      { fr: 'J\'ai le cafard depuis qu\'elle est partie.', es: 'Estoy de bajón desde que ella se fue.' },
      { fr: 'Quand il pleut plusieurs jours de suite, j\'ai le cafard.', es: 'Cuando llueve varios días seguidos, me da bajón.' },
      { fr: 'Ne t\'inquiète pas, tout le monde a le cafard de temps en temps.', es: 'No te preocupes, todo el mundo tiene morriña de vez en cuando.' },
      { fr: 'Il a le cafard parce que ses amis lui manquent.', es: 'Tiene morriña porque echa de menos a sus amigos.' },
    ],
  },
  {
    pattern: 'casser les pieds à quelqu\'un',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Ce type me casse les pieds depuis ce matin.', es: 'Ese tío me está dando la lata desde esta mañana.' },
      { fr: 'Arrête de me casser les pieds avec tes questions !', es: '¡Deja de darme la lata con tus preguntas!' },
      { fr: 'Mon voisin me casse les pieds tous les jours.', es: 'Mi vecino me da la lata todos los días.' },
      { fr: 'Ne casse pas les pieds à ta sœur, elle travaille.', es: 'No molestes a tu hermana, está trabajando.' },
      { fr: 'Il commence vraiment à me casser les pieds avec ses histoires.', es: 'Empieza a molestarme de verdad con sus historias.' },
    ],
  },
  {
    pattern: 'donner sa langue au chat',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Je ne sais pas quoi répondre. Je donne ma langue au chat.', es: 'No sé qué responder. Me rindo.' },
      { fr: 'Après dix minutes, elle a donné sa langue au chat.', es: 'Después de diez minutos, tiró la toalla intentando adivinarlo.' },
      { fr: 'Tu donnes ta langue au chat ? La réponse était évidente !', es: '¿Te rindes? ¡La respuesta era evidente!' },
      { fr: 'Je préfère donner ma langue au chat plutôt que de dire une bêtise.', es: 'Prefiero rendirme antes que decir una tontería.' },
    ],
  },
  {
    pattern: 'raconter des salades',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Il raconte des salades pour se rendre intéressant.', es: 'Cuenta trolas para hacerse el interesante.' },
      { fr: 'Ne l\'écoute pas, il raconte toujours des salades.', es: 'No le hagas caso, siempre cuenta mentiras.' },
      { fr: 'Elle a raconté des salades à ses parents sur ce qu\'elle avait fait.', es: 'Les contó historias inventadas a sus padres sobre lo que había hecho.' },
      { fr: 'Arrête de raconter des salades, on sait la vérité.', es: 'Deja de contar trolas, sabemos la verdad.' },
      { fr: 'Il raconte des salades depuis qu\'on le connaît.', es: 'Cuenta mentiras desde que le conocemos.' },
    ],
  },
  {
    pattern: 'avoir la pêche',
    category: 'estados-de-animo',
    examples: [
      { fr: 'J\'ai la pêche aujourd\'hui, tout va bien.', es: 'Estoy a tope hoy, todo va bien.' },
      { fr: 'Après ses vacances, il a la pêche.', es: 'Después de sus vacaciones, está a tope.' },
      { fr: 'Elle a la pêche dès qu\'elle prend un café.', es: 'Se pone a tope en cuanto se toma un café.' },
      { fr: 'Comment tu fais pour avoir la pêche à cette heure ?', es: '¿Cómo haces para tener tanta energía a esta hora?' },
      { fr: 'Ils ont la pêche depuis qu\'ils ont commencé le sport.', es: 'Están a tope desde que empezaron a hacer deporte.' },
    ],
  },
  {
    pattern: 'poser un lapin à quelqu\'un',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Il m\'a posé un lapin hier soir.', es: 'Me dejó plantado ayer por la noche.' },
      { fr: 'Elle lui a posé un lapin au dernier moment.', es: 'Le dejó plantado en el último momento.' },
      { fr: 'Si tu me poses un lapin encore une fois, je ne te parle plus.', es: 'Si me dejas plantado otra vez, no te vuelvo a hablar.' },
      { fr: 'Ne pose jamais un lapin à ta grand-mère.', es: 'No dejes plantada nunca a tu abuela.' },
      { fr: 'On lui a posé un lapin trois fois de suite.', es: 'Le dejaron plantado tres veces seguidas.' },
    ],
  },
  {
    pattern: 'se creuser la tête',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Je me suis creusé la tête pour résoudre ce problème.', es: 'Me estrujé los sesos para resolver este problema.' },
      { fr: 'Il se creuse la tête pour trouver un cadeau original.', es: 'Se está estrujando los sesos para encontrar un regalo original.' },
      { fr: 'Arrête de te creuser la tête, la réponse viendra toute seule.', es: 'Deja de comerte el coco, la respuesta vendrá sola.' },
      { fr: 'Nous nous sommes creusé la tête pendant des heures.', es: 'Nos estuvimos estrujando los sesos durante horas.' },
      { fr: 'Pas la peine de te creuser la tête, je vais t\'aider.', es: 'No hace falta que te comas el coco, te voy a ayudar.' },
    ],
  },
  {
    pattern: 'être dans la lune',
    category: 'estados-de-animo',
    examples: [
      { fr: 'Juan est dans la lune, il n\'écoute pas le professeur.', es: 'Juan está en la luna, no escucha al profesor.' },
      { fr: 'Tu es dans la lune ce matin, ça va ?', es: 'Estás en las nubes esta mañana, ¿estás bien?' },
      { fr: 'Elle est toujours dans la lune pendant les réunions.', es: 'Siempre está distraída durante las reuniones.' },
      { fr: 'Depuis qu\'il est amoureux, il est dans la lune.', es: 'Desde que está enamorado, está en las nubes.' },
      { fr: 'Excuse-moi, j\'étais dans la lune, tu disais ?', es: 'Perdona, estaba en la luna, ¿qué decías?' },
    ],
  },
  {
    pattern: 'avoir un poil dans la main',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Il n\'a jamais envie de travailler. Il a un poil dans la main.', es: 'Nunca tiene ganas de trabajar. Es un vago que no da un palo al agua.' },
      { fr: 'Mon fils a un poil dans la main, il ne veut rien faire à la maison.', es: 'Mi hijo es un vago, no quiere hacer nada en casa.' },
      { fr: 'Ce collègue a un poil dans la main, tout le monde le sait.', es: 'Ese compañero es un vago, todo el mundo lo sabe.' },
      { fr: 'Elle a beau avoir un poil dans la main, elle réussit toujours.', es: 'Por muy vaga que sea, siempre le sale bien.' },
    ],
  },
  {
    pattern: 'mettre son grain de sel',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Il met toujours son grain de sel dans nos discussions.', es: 'Siempre mete baza en nuestras discusiones.' },
      { fr: 'Arrête de mettre ton grain de sel, ça ne te regarde pas.', es: 'Deja de meter baza, no es asunto tuyo.' },
      { fr: 'Ma belle-mère met son grain de sel dans notre couple.', es: 'Mi suegra se mete en nuestra pareja opinando sin que le pidan.' },
      { fr: 'Elle ne peut pas s\'empêcher de mettre son grain de sel partout.', es: 'No puede evitar meter baza en todo.' },
      { fr: 'Si tu mets encore ton grain de sel, on ne t\'invite plus.', es: 'Si vuelves a meter baza, no te invitamos más.' },
    ],
  },
  {
    pattern: 'être au bout du rouleau',
    category: 'estados-de-animo',
    examples: [
      { fr: 'Après le travail, je me sens au bout du rouleau.', es: 'Después del trabajo, me siento al límite.' },
      { fr: 'Elle est au bout du rouleau après cette semaine difficile.', es: 'Está al límite después de esta semana difícil.' },
      { fr: 'Avec les enfants malades, on est au bout du rouleau.', es: 'Con los niños enfermos, estamos agotados.' },
      { fr: 'Il faut que je prenne des vacances, je suis au bout du rouleau.', es: 'Necesito irme de vacaciones, estoy al borde del colapso.' },
      { fr: 'Après trois mois sans dormir, elle était au bout du rouleau.', es: 'Después de tres meses sin dormir, estaba al límite.' },
    ],
  },
  {
    pattern: 'ne pas être sorti de l\'auberge',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Avec les préparatifs du mariage, on n\'est pas sortis de l\'auberge.', es: 'Con los preparativos de la boda, aún nos queda mucho por resolver.' },
      { fr: 'Si tu commences à peine, tu n\'es pas sorti de l\'auberge.', es: 'Si acabas de empezar, no has salido del atolladero.' },
      { fr: 'Avec tous ces problèmes techniques, on n\'est pas sortis de l\'auberge.', es: 'Con todos estos problemas técnicos, aún tenemos muchas dificultades por delante.' },
      { fr: 'Il n\'est pas sorti de l\'auberge avec cette histoire au tribunal.', es: 'No ha salido del atolladero con este asunto en el tribunal.' },
      { fr: 'Vu la situation, ils ne sont pas sortis de l\'auberge.', es: 'Visto lo visto, aún les queda mucho lío por resolver.' },
    ],
  },
  {
    pattern: 'avoir la frite',
    category: 'estados-de-animo',
    examples: [
      { fr: 'Depuis qu\'il a reçu ces bonnes nouvelles, Juan a la frite tous les jours.', es: 'Desde que recibió esas buenas noticias, Juan está en plena forma todos los días.' },
      { fr: 'J\'ai la frite ce matin, on va où tu veux !', es: '¡Estoy a tope esta mañana, vamos donde quieras!' },
      { fr: 'Elle a la frite depuis qu\'elle a arrêté de fumer.', es: 'Está a tope desde que dejó de fumar.' },
      { fr: 'Ils ont la frite avant chaque match.', es: 'Están en plena forma antes de cada partido.' },
      { fr: 'Comment tu as la frite comme ça après une nuit blanche ?', es: '¿Cómo puedes estar tan lleno de energía después de una noche en vela?' },
    ],
  },
  {
    pattern: 'avoir d\'autres chats à fouetter',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Ça ne m\'inquiète pas beaucoup. J\'ai d\'autres chats à fouetter.', es: 'No me preocupa mucho. Tengo cosas más importantes de las que ocuparme.' },
      { fr: 'Le patron a d\'autres chats à fouetter en ce moment.', es: 'El jefe tiene otras cosas más importantes ahora mismo.' },
      { fr: 'J\'ai d\'autres chats à fouetter que d\'écouter tes bêtises.', es: 'Tengo cosas mejores que hacer que escuchar tus tonterías.' },
      { fr: 'Ne t\'occupe pas de ça, tu as d\'autres chats à fouetter.', es: 'No te ocupes de eso, tienes asuntos más importantes.' },
      { fr: 'Avec le projet en cours, on a d\'autres chats à fouetter.', es: 'Con el proyecto en marcha, tenemos asuntos más importantes.' },
    ],
  },
  {
    pattern: 'faire la grasse matinée',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Nicolas fait toujours la grasse matinée le dimanche.', es: 'Nicolas siempre se queda durmiendo hasta tarde los domingos.' },
      { fr: 'J\'ai fait la grasse matinée jusqu\'à midi.', es: 'Me quedé durmiendo hasta el mediodía.' },
      { fr: 'On va faire la grasse matinée ce week-end.', es: 'Nos vamos a levantar tarde este fin de semana.' },
      { fr: 'Elle adore faire la grasse matinée quand elle ne travaille pas.', es: 'Le encanta remolonear en la cama cuando no trabaja.' },
      { fr: 'Faire la grasse matinée est mon plus grand plaisir.', es: 'Quedarme durmiendo hasta tarde es mi mayor placer.' },
    ],
  },
  {
    pattern: 'mettre la main à la pâte',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Tu dois mettre la main à la pâte si tu veux sortir avec tes amis.', es: 'Tienes que arrimar el hombro si quieres salir con tus amigos.' },
      { fr: 'Tout le monde a mis la main à la pâte pour organiser la fête.', es: 'Todo el mundo arrimó el hombro para organizar la fiesta.' },
      { fr: 'Si chacun met la main à la pâte, on finira plus vite.', es: 'Si cada uno arrima el hombro, acabaremos antes.' },
      { fr: 'Le directeur n\'a pas peur de mettre la main à la pâte.', es: 'Al director no le da miedo arremangarse y trabajar con los demás.' },
      { fr: 'Elle met toujours la main à la pâte quand il y a beaucoup de travail.', es: 'Siempre arrima el hombro cuando hay mucho trabajo.' },
    ],
  },
  {
    pattern: 'être lessivé',
    category: 'estados-de-animo',
    examples: [
      { fr: 'Pardonne-moi, je suis lessivé.', es: 'Perdóname, estoy hecho polvo.' },
      { fr: 'Après ce marathon, je suis complètement lessivé.', es: 'Después de este maratón, estoy completamente hecho polvo.' },
      { fr: 'Elle est lessivée après avoir gardé les enfants toute la journée.', es: 'Está hecha polvo después de cuidar a los niños todo el día.' },
      { fr: 'On était lessivés en rentrant de la randonnée.', es: 'Volvimos hechos polvo de la excursión.' },
      { fr: 'Je vais me coucher, je suis lessivé.', es: 'Me voy a dormir, estoy destrozado.' },
    ],
  },
  {
    pattern: 'se mettre dans de beaux draps',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Il s\'est mis dans de beaux draps en mentant à son patron.', es: 'Se metió en un buen lío al mentirle a su jefe.' },
      { fr: 'Si tu ne rends pas ce document à temps, tu vas te mettre dans de beaux draps.', es: 'Si no entregas ese documento a tiempo, te vas a meter en un buen lío.' },
      { fr: 'Elle s\'est mise dans de beaux draps avec cette histoire.', es: 'Se metió en un buen embrollo con ese asunto.' },
      { fr: 'Nous nous sommes mis dans de beaux draps en signant sans lire.', es: 'Nos metimos en un buen lío al firmar sin leer.' },
      { fr: 'Fais attention, tu vas te mettre dans de beaux draps.', es: 'Ten cuidado, te vas a meter en un buen lío.' },
    ],
  },
  {
    pattern: 'avoir le bras long',
    category: 'expresiones-cotidianas',
    examples: [
      { fr: 'Son oncle a le bras long au ministère.', es: 'Su tío tiene contactos influyentes en el ministerio.' },
      { fr: 'Il a le bras long, il peut te trouver un poste rapidement.', es: 'Tiene enchufe, puede conseguirte un puesto rápidamente.' },
      { fr: 'Cette famille a le bras long dans la région.', es: 'Esa familia tiene mucha influencia en la región.' },
      { fr: 'Elle a le bras long dans le milieu du cinéma.', es: 'Tiene muchos contactos en el mundo del cine.' },
      { fr: 'Si tu veux ce contrat, il faut connaître quelqu\'un qui a le bras long.', es: 'Si quieres ese contrato, tienes que conocer a alguien con contactos.' },
    ],
  },
];

(async () => {
  const lang = await p.language.findFirst({ where: { name: 'Français' } });
  if (!lang) { console.error('Français not found'); process.exit(1); }

  let created = 0, skipped = 0, examplesInserted = 0;
  for (const idiom of IDIOMS) {
    const existing = await p.structure.findFirst({
      where: { languageId: lang.id, pattern: idiom.pattern },
    });
    if (existing) {
      console.log(`SKIP (already exists): ${idiom.pattern}`);
      skipped++;
      continue;
    }
    const s = await p.structure.create({
      data: {
        languageId: lang.id,
        pattern: idiom.pattern,
        category: idiom.category,
        hasSlot: false,
        exampleCount: idiom.examples.length,
      },
    });
    await p.structureExample.createMany({
      data: idiom.examples.map((ex, i) => ({
        structureId: s.id,
        text: ex.fr,
        spanish: ex.es,
        order: i,
      })),
    });
    created++;
    examplesInserted += idiom.examples.length;
    console.log(`OK: ${idiom.pattern} (+${idiom.examples.length} ejemplos)`);
  }
  console.log(`\nDone. Created ${created} idioms, skipped ${skipped}. Total examples: ${examplesInserted}.`);
  await p.$disconnect();
})();
