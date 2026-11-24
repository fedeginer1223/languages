import { prisma } from '../utils/prisma';
import { CreateLanguageDto, UpdateLanguageDto } from '../types';

export const languageService = {
  async getAll(userId: string) {
    const languages = await prisma.language.findMany({
      where: { userId },
      include: {
        _count: {
          select: {
            topics: true,
            verbs: true,
            essays: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      languages.map(async (lang) => {
        const words = await prisma.word.findMany({
          where: {
            topic: {
              languageId: lang.id,
            },
          },
        });

        const avgSuccessRate = words.length > 0
          ? words.reduce((sum, w) => sum + w.successRate, 0) / words.length
          : 0;

        return {
          ...lang,
          stats: {
            topicsCount: lang._count.topics,
            wordsCount: words.length,
            verbsCount: lang._count.verbs,
            essaysCount: lang._count.essays,
            avgSuccessRate: Math.round(avgSuccessRate * 10) / 10,
          },
        };
      })
    );
  },

  async getById(id: string) {
    const language = await prisma.language.findUnique({
      where: { id },
      include: {
        topics: {
          include: {
            _count: {
              select: { words: true },
            },
          },
        },
        verbs: true,
        essays: true,
      },
    });

    if (!language) {
      throw new Error('Language not found');
    }

    return language;
  },

  async create(userId: string, data: CreateLanguageDto) {
    return prisma.language.create({
      data: { ...data, userId },
    });
  },

  async update(id: string, data: UpdateLanguageDto) {
    // never let the body change ownership
    delete (data as any).userId;
    delete (data as any).id;
    return prisma.language.update({
      where: { id },
      data,
    });
  },

  async delete(id: string) {
    return prisma.language.delete({
      where: { id },
    });
  },
};
