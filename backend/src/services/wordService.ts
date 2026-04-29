import { prisma } from '../utils/prisma';
import { CreateWordDto, CreateWordsBatchDto } from '../types';
import { calculateSuccessRate } from '../utils/validation';

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

    return prisma.word.update({
      where: { id },
      data: {
        attempts: newAttempts,
        correctCount: newCorrectCount,
        successRate: newSuccessRate,
      },
    });
  },
};
