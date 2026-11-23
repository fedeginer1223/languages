/**
 * One-shot seed: imports a curated set of English structures into the
 * language with code 'en'. Idempotent: skips any structure whose pattern
 * already exists for that language.
 *
 *   npx ts-node scripts/seedEnglishStructures.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SeedStructure {
  pattern: string;
  category: string;
  examples: string[];
  /** If this entry corrected an original (broken) note, note it here for the log */
  correctedFrom?: string;
}

const STRUCTURES: SeedStructure[] = [
  {
    pattern: 'He may not have been able to ___',
    category: 'uncertainty',
    examples: [
      'He may not have been able to answer.',
      'She may not have been able to attend the meeting.',
    ],
  },
  {
    pattern: "I'm not sure how ___",
    category: 'uncertainty',
    examples: [
      "I'm not sure how widespread this phenomenon is.",
      "I'm not sure how reliable that data is.",
    ],
  },
  {
    pattern: 'Beneath the surface, ___',
    category: 'connector',
    examples: [
      'Beneath the surface, we all seem to carry the same assumption.',
      'Beneath the surface, things are more complicated than they appear.',
    ],
  },
  {
    pattern: 'It underpins ___',
    category: 'other',
    examples: [
      'It underpins our worldview and conduct.',
      'This belief underpins the entire strategy.',
    ],
  },
  {
    pattern: 'It did not take ___ long to ___',
    category: 'connector',
    examples: [
      "It did not take him long to understand that he wasn't.",
      "It didn't take us long to realize the mistake.",
    ],
  },
  {
    pattern: 'It would be a great pleasure ___ if you would ___',
    category: 'idiom',
    examples: [
      'It would be a great pleasure to me if you would come in when you have nothing better to do.',
      'It would be a great pleasure for us if you would join us for dinner.',
    ],
  },
  {
    pattern: 'On ___ way back ___, ___',
    category: 'connector',
    examples: [
      'On their way back home, he remarked that the day had gone better than expected.',
      'On the way back from work, she realized she had forgotten her keys.',
    ],
  },
  {
    pattern: 'The more ___, the more ___',
    category: 'grammar',
    examples: [
      'The more he thought of what he could do with the money, the more it inflamed his fancy.',
      'The more you practice, the better you get.',
    ],
  },
  {
    pattern: "I'm curious what you intend to ___",
    category: 'opinion',
    examples: [
      "I'm curious what you intend to do with this proposal.",
      "I'm curious what you plan to do next.",
    ],
  },
  {
    pattern: "If there's one thing I'm convinced of, it's that ___",
    category: 'opinion',
    correctedFrom: "If there is sth i'm convinced of is that we are going to get to the 100M$",
    examples: [
      "If there's one thing I'm convinced of, it's that we are going to reach $100M.",
      "If there's one thing I'm convinced of, it's that this strategy will work.",
    ],
  },
  {
    pattern: '___ in the same breath',
    category: 'idiom',
    examples: [
      "We shouldn't even be talking about these two things in the same breath.",
      "You can't mention them in the same breath.",
    ],
  },
  {
    pattern: 'At first glance, ___ seems ___',
    category: 'opinion',
    examples: [
      'At first glance, the mapping seems entirely feasible.',
      'At first glance, the proposal seems reasonable.',
    ],
  },
  {
    pattern: "The one thing I'd strongly like to avoid is ___",
    category: 'opinion',
    examples: [
      "The one thing I'd strongly like to avoid is triggering the call directly from Salesforce.",
      "The one thing I'd strongly like to avoid is rushing this decision.",
    ],
  },
  {
    pattern: "we don't even have ___",
    category: 'opinion',
    examples: [
      "We don't even have the input from the finance team.",
      "I don't even have time to read this.",
    ],
  },
  {
    pattern: "We don't want you not to ___",
    category: 'grammar',
    correctedFrom: 'We do not want you to not to have the best cost in which to run the platform',
    examples: [
      "We don't want you not to have the best cost to run the platform.",
      "We don't want you not to benefit from this.",
    ],
  },
  {
    pattern: 'derive value from ___',
    category: 'idiom',
    examples: [
      "You don't derive value from the platform.",
      'We derive significant value from this partnership.',
    ],
  },
  {
    pattern: 'The way ___ is at the moment, ___',
    category: 'opinion',
    correctedFrom: 'in the way the european market is in the minute in transportation that is not going to work',
    examples: [
      "The way the European market is at the moment, transportation isn't going to work.",
      "The way things are at the moment, that proposal won't fly.",
    ],
  },
  {
    pattern: 'Can we have a copy of ___ that ___?',
    category: 'idiom',
    correctedFrom: 'Can we have a copy of the call flow that was being shared a couple time ago?',
    examples: [
      'Can we have a copy of the call flow that was shared earlier?',
      'Can we have a copy of the deck that was presented yesterday?',
    ],
  },
  {
    pattern: 'stand up for the right to ___',
    category: 'idiom',
    examples: [
      'You need to stand up for the right to listen to people you then go on to disagree with.',
      'We must stand up for the right to disagree.',
    ],
  },
  {
    pattern: 'There is a sense in which ___',
    category: 'opinion',
    examples: [
      'There is a sense in which we feel we are all becoming Spain in 2027.',
      'There is a sense in which everyone is responsible.',
    ],
  },
  {
    pattern: 'It was ___ I was most ___ by',
    category: 'grammar',
    correctedFrom: "It was this world and it's motivation I was most intrigued by",
    examples: [
      'It was this world and its motivations I was most intrigued by.',
      'It was her honesty I was most impressed by.',
    ],
  },
  {
    pattern: '___ or else ___',
    category: 'idiom',
    examples: [
      "So please don't, or else it will end.",
      "Hurry up, or else we'll miss the train.",
    ],
  },
  {
    pattern: "I don't come across like ___",
    category: 'idiom',
    examples: [
      "I'm aware I don't come across like I'm from Swindon.",
      "She doesn't come across like a typical CEO.",
    ],
  },
  {
    pattern: 'No sooner had ___ than ___',
    category: 'grammar',
    examples: [
      'No sooner had I arrived than it started raining.',
      'No sooner had we sat down than the show began.',
    ],
  },
  {
    pattern: 'Hardly had ___ when ___',
    category: 'grammar',
    examples: [
      'Hardly had we sat down when the phone rang.',
      'Hardly had he finished speaking when the audience applauded.',
    ],
  },
  {
    pattern: "If it hadn't been for ___, ___ would have ___",
    category: 'grammar',
    examples: [
      "If it hadn't been for his help, I would have failed.",
      "If it hadn't been for the rain, we would have gone hiking.",
    ],
  },
];

function detectHasSlot(pattern: string): boolean {
  return /_{2,}|___/.test(pattern) || /\.\.\.$/.test(pattern) || /\b(?:to|that|of)\s+\.\.\./i.test(pattern);
}

async function main() {
  const lang = await prisma.language.findFirst({ where: { code: 'en' } });
  if (!lang) {
    throw new Error("Language with code 'en' not found. Create it first.");
  }
  console.log(`Importing into language: ${lang.name} (${lang.id})\n`);

  let created = 0;
  let skipped = 0;
  let corrections = 0;

  for (const s of STRUCTURES) {
    const existing = await prisma.structure.findFirst({
      where: { languageId: lang.id, pattern: s.pattern },
    });
    if (existing) {
      skipped++;
      console.log(`⏭  Already exists: ${s.pattern}`);
      continue;
    }

    await prisma.structure.create({
      data: {
        languageId: lang.id,
        pattern: s.pattern,
        category: s.category,
        hasSlot: detectHasSlot(s.pattern),
        examples: {
          create: s.examples.map((text, order) => ({ text, order })),
        },
      },
    });

    created++;
    if (s.correctedFrom) {
      corrections++;
      console.log(`✓ Created (corrected): ${s.pattern}`);
      console.log(`     Original: "${s.correctedFrom}"`);
    } else {
      console.log(`✓ Created: ${s.pattern}`);
    }
  }

  console.log(`\nSummary: ${created} created, ${skipped} skipped, ${corrections} of those were corrections.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
