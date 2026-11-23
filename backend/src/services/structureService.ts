import { prisma } from '../utils/prisma';

function detectHasSlot(pattern: string): boolean {
  return /_{2,}|___/.test(pattern) || /\.\.\.$/.test(pattern) || /\b(?:to|that|of)\s+\.\.\./i.test(pattern);
}

export const structureService = {
  async list(languageId: string) {
    return prisma.structure.findMany({
      where: { languageId },
      include: { examples: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });
  },

  async getById(id: string) {
    return prisma.structure.findUnique({
      where: { id },
      include: { examples: { orderBy: { order: 'asc' } } },
    });
  },

  async create(languageId: string, data: { pattern: string; category: string; examples: string[] }) {
    const hasSlot = detectHasSlot(data.pattern);
    return prisma.structure.create({
      data: {
        languageId,
        pattern: data.pattern.trim(),
        category: data.category,
        hasSlot,
        examples: {
          create: data.examples
            .map((t, i) => ({ text: t.trim(), order: i }))
            .filter((e) => e.text.length > 0),
        },
      },
      include: { examples: { orderBy: { order: 'asc' } } },
    });
  },

  async update(id: string, data: { pattern?: string; category?: string; examples?: string[] }) {
    const updates: any = {};
    if (data.pattern !== undefined) {
      updates.pattern = data.pattern.trim();
      updates.hasSlot = detectHasSlot(data.pattern);
    }
    if (data.category !== undefined) updates.category = data.category;

    if (data.examples !== undefined) {
      // Replace examples wholesale
      await prisma.structureExample.deleteMany({ where: { structureId: id } });
      await prisma.structureExample.createMany({
        data: data.examples
          .map((t, i) => ({ structureId: id, text: t.trim(), order: i }))
          .filter((e) => e.text.length > 0),
      });
    }

    return prisma.structure.update({
      where: { id },
      data: updates,
      include: { examples: { orderBy: { order: 'asc' } } },
    });
  },

  async delete(id: string) {
    return prisma.structure.delete({ where: { id } });
  },

  async setExampleCount(id: string, n: number) {
    return prisma.structure.update({
      where: { id },
      data: { exampleCount: Math.max(1, Math.min(30, Math.floor(n))) },
    });
  },

  /**
   * Replace ALL examples for a structure with the given list. Each item may
   * carry a spanish prompt + target-language reference. Also resets per-example
   * counters (this is a full regeneration).
   */
  async replaceExamples(
    structureId: string,
    examples: { spanish?: string | null; text: string }[]
  ) {
    await prisma.structureExample.deleteMany({ where: { structureId } });
    if (examples.length > 0) {
      await prisma.structureExample.createMany({
        data: examples
          .map((e, i) => ({
            structureId,
            text: (e.text ?? '').trim(),
            spanish: e.spanish ? e.spanish.trim() : null,
            order: i,
          }))
          .filter((e) => e.text.length > 0),
      });
    }
    return prisma.structure.findUnique({
      where: { id: structureId },
      include: { examples: { orderBy: { order: 'asc' } } },
    });
  },

  /**
   * Record a training attempt on a single example. Increments attempts, and
   * (if correct) correctCount. correctCount is CUMULATIVE (not consecutive) —
   * an example is considered "dominated" when correctCount >= 2.
   */
  async recordExampleAttempt(exampleId: string, correct: boolean) {
    const ex = await prisma.structureExample.findUnique({ where: { id: exampleId } });
    if (!ex) throw new Error('Example not found');
    return prisma.structureExample.update({
      where: { id: exampleId },
      data: {
        attempts: ex.attempts + 1,
        correctCount: ex.correctCount + (correct ? 1 : 0),
        lastTrainedAt: new Date(),
      },
    });
  },
};
