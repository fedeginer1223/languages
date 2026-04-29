import { prisma } from '../utils/prisma';
import { CreateTopicDto } from '../types';

export const topicService = {
  async getByLanguageId(languageId: string) {
    const topics = await prisma.topic.findMany({
      where: { languageId, name: { not: 'Errores de redacción' } },
      include: {
        _count: {
          select: { words: true },
        },
        words: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return topics.map((topic) => {
      const avgSuccessRate = topic.words.length > 0
        ? topic.words.reduce((sum, w) => sum + w.successRate, 0) / topic.words.length
        : 0;

      return {
        id: topic.id,
        name: topic.name,
        description: topic.description,
        languageId: topic.languageId,
        wordsCount: topic._count.words,
        avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
        createdAt: topic.createdAt,
        updatedAt: topic.updatedAt,
      };
    });
  },

  async getById(id: string) {
    const topic = await prisma.topic.findUnique({
      where: { id },
      include: {
        words: {
          orderBy: { createdAt: 'desc' },
        },
        language: true,
      },
    });

    if (!topic) {
      throw new Error('Topic not found');
    }

    return topic;
  },

  async create(languageId: string, data: CreateTopicDto) {
    return prisma.topic.create({
      data: {
        ...data,
        languageId,
      },
    });
  },

  async update(id: string, data: Partial<CreateTopicDto>) {
    return prisma.topic.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.topic.delete({
      where: { id },
    });
  },
};
