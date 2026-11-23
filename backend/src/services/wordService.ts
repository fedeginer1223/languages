import { prisma } from '../utils/prisma';
import { CreateWordDto, CreateWordsBatchDto } from '../types';
import { calculateSuccessRate, calculateWeightedScore } from '../utils/validation';

type SortBy = 'learning' | 'recent' | 'alphabetical';

export const wordService = {
  async getByTopicId(
    topicId: string,
    sortBy: SortBy = 'learning',
    limit: number = 50,
    offset: number = 0
  ) {
    let orderBy: any = { createdAt: 'desc' };

    if (sortBy === 'learning') {
      orderBy = [
        { successRate: 'asc' },
        { attempts: 'asc' },
        { createdAt: 'desc' },
      ];
    } else if (sortBy === 'alphabetical') {
      orderBy = { term: 'asc' };
    }

    return prisma.word.findMany({
      where: { topicId },
      orderBy,
      take: limit,
      skip: offset,
    });
  },

  async getById(id: string) {
    const word = await prisma.word.findUnique({
      where: { id },
      include: { topic: true },
    });

    if (!word) {
      throw new Error('Word not found');
    }

    return word;
  },

  async create(topicId: string, data: CreateWordDto) {
    return prisma.word.create({
      data: {
        ...data,
        topicId,
      },
    });
  },

  async createBatch(topicId: string, data: CreateWordsBatchDto) {
    const words = await prisma.$transaction(
      data.words.map((word) =>
        prisma.word.create({
          data: {
            ...word,
            topicId,
          },
        })
      )
    );

    return {
      created: words.length,
      words,
    };
  },

  /**
   * Import a batch of vocabulary into a language, resolving the target topic by
   * name (creating it if it doesn't exist). Idempotent per topic: words whose
   * `term` (case-insensitive) already exists in that topic are skipped.
   */
  async importForLanguage(
    languageId: string,
    data: { topicName: string; words: { term: string; definition: string }[] }
  ) {
    const topicName = data.topicName.trim();
    if (!topicName) throw new Error('topicName is required');

    let topic = await prisma.topic.findFirst({
      where: { languageId, name: topicName },
    });
    let topicCreated = false;
    if (!topic) {
      topic = await prisma.topic.create({
        data: { languageId, name: topicName, description: 'Importado' },
      });
      topicCreated = true;
    }

    const cleaned = data.words
      .map((w) => ({ term: (w.term ?? '').trim(), definition: (w.definition ?? '').trim() }))
      .filter((w) => w.term.length > 0 && w.definition.length > 0);

    // Dedupe within the incoming batch (first-wins) by lower-cased term.
    const seen = new Map<string, { term: string; definition: string }>();
    for (const w of cleaned) {
      const key = w.term.toLowerCase();
      if (!seen.has(key)) seen.set(key, w);
    }
    const unique = Array.from(seen.values());

    // Skip terms that already exist in this topic (case-insensitive).
    const existing = await prisma.word.findMany({
      where: { topicId: topic.id },
      select: { term: true },
    });
    const existingSet = new Set(existing.map((w) => w.term.toLowerCase()));
    const toInsert = unique.filter((w) => !existingSet.has(w.term.toLowerCase()));

    let inserted = 0;
    if (toInsert.length > 0) {
      const CHUNK = 200;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        const result = await prisma.word.createMany({
          data: chunk.map((w) => ({
            topicId: topic!.id,
            term: w.term,
            definition: w.definition,
            source: 'vocabulary',
          })),
          skipDuplicates: true,
        });
        inserted += result.count;
      }
    }

    return {
      topicId: topic.id,
      topicName: topic.name,
      topicCreated,
      totalProvided: data.words.length,
      totalUnique: unique.length,
      alreadyExisting: unique.length - toInsert.length,
      inserted,
    };
  },

  async update(id: string, data: Partial<CreateWordDto>) {
    return prisma.word.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.word.delete({
      where: { id },
    });
  },

  async updateStats(id: string, correct: boolean) {
    const word = await prisma.word.findUnique({
      where: { id },
    });

    if (!word) {
      throw new Error('Word not found');
    }

    const newAttempts = word.attempts + 1;
    const newCorrectCount = correct ? word.correctCount + 1 : word.correctCount;
    const newSuccessRate = calculateSuccessRate(newCorrectCount, newAttempts);

    // Update recent results (keep last 30)
    const MAX_RECENT = 30;
    const recent = word.recentResults + (correct ? '1' : '0');
    const newRecent = recent.length > MAX_RECENT ? recent.slice(-MAX_RECENT) : recent;
    const newWeightedScore = calculateWeightedScore(newRecent);

    return prisma.word.update({
      where: { id },
      data: {
        attempts: newAttempts,
        correctCount: newCorrectCount,
        successRate: newSuccessRate,
        recentResults: newRecent,
        weightedScore: newWeightedScore,
      },
    });
  },
};
