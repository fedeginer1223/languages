import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../utils/prisma';
import { CreateEssayDto, CorrectionResult, ErrorType } from '../types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const essayService = {
  async getByLanguageId(languageId: string) {
    return prisma.essay.findMany({
      where: { languageId },
      include: {
        corrections: {
          include: {
            errors: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },

  async getById(id: string) {
    const essay = await prisma.essay.findUnique({
      where: { id },
      include: {
        corrections: {
          include: {
            errors: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        language: true,
      },
    });

    if (!essay) {
      throw new Error('Essay not found');
    }

    return essay;
  },

  async create(languageId: string, data: CreateEssayDto) {
    const language = await prisma.language.findUnique({
      where: { id: languageId },
    });

    if (!language) {
      throw new Error('Language not found');
    }

    const correctionResult = await this.correctEssay(data.text, language.name);

    const essay = await prisma.essay.create({
      data: {
        title: data.title,
        originalText: data.text,
        languageId,
        corrections: {
          create: {
            correctedText: correctionResult.correctedText,
            feedback: correctionResult.feedback,
            errors: {
              create: correctionResult.errors,
            },
          },
        },
      },
      include: {
        corrections: {
          include: {
            errors: true,
          },
        },
      },
    });

    // Auto-create trainable words from errors
    if (correctionResult.errors.length > 0) {
      await this.createErrorWords(languageId, correctionResult.errors);
    }

    return essay;
  },

  async createManual(languageId: string, data: {
    title?: string;
    text: string;
    errors: { redText: string; fullWord: string; category: string; context: string; start: number; end: number }[];
  }) {
    const dbErrors = data.errors.map((e) => ({
      errorType: e.category,
      original: e.redText,
      corrected: e.fullWord,
      explanation: e.context,
      position: e.start,
    }));

    const spans = data.errors.map((e) => ({ word: e.redText, start: e.start, end: e.end }));

    const essay = await prisma.essay.create({
      data: {
        title: data.title,
        originalText: data.text,
        languageId,
        corrections: {
          create: {
            correctedText: data.text,
            feedback: JSON.stringify(spans),
            errors: {
              create: dbErrors,
            },
          },
        },
      },
      include: {
        corrections: {
          include: { errors: true },
        },
      },
    });

    // Auto-create trainable words
    if (data.errors.length > 0) {
      await this.createErrorWords(languageId, dbErrors);
    }

    return essay;
  },

  async updateManual(id: string, data: {
    title?: string;
    text: string;
    errors: { redText: string; fullWord: string; category: string; context: string; start: number; end: number }[];
  }) {
    const essay = await prisma.essay.findUnique({
      where: { id },
      include: { corrections: { include: { errors: true } } },
    });
    if (!essay) throw new Error('Essay not found');

    await prisma.essayCorrection.deleteMany({ where: { essayId: id } });

    const dbErrors = data.errors.map((e) => ({
      errorType: e.category,
      original: e.redText,
      corrected: e.fullWord,
      explanation: e.context,
      position: e.start,
    }));

    const spans = data.errors.map((e) => ({ word: e.redText, start: e.start, end: e.end }));

    const updated = await prisma.essay.update({
      where: { id },
      data: {
        title: data.title,
        originalText: data.text,
        corrections: {
          create: {
            correctedText: data.text,
            feedback: JSON.stringify(spans),
            errors: { create: dbErrors },
          },
        },
      },
      include: { corrections: { include: { errors: true } } },
    });

    if (data.errors.length > 0) {
      await this.createErrorWords(essay.languageId, dbErrors);
    }

    return updated;
  },

  async getErrorsForTraining(languageId: string, categories?: string[]) {
    const where: any = {
      correction: { essay: { languageId } },
    };
    if (categories && categories.length > 0) {
      where.errorType = { in: categories };
    }

    const errors = await prisma.error.findMany({
      where,
      include: {
        correction: {
          include: { essay: { select: { originalText: true } } },
        },
      },
      orderBy: [{ successRate: 'asc' }, { attempts: 'asc' }],
    });

    return errors.map((e) => {
      // Build context sentence: find the sentence containing the error
      const text = e.correction.essay.originalText;
      const pos = e.position ?? text.toLowerCase().indexOf(e.corrected.toLowerCase());
      let sentenceStart = text.lastIndexOf('.', pos - 1);
      sentenceStart = sentenceStart === -1 ? 0 : sentenceStart + 1;
      let sentenceEnd = text.indexOf('.', pos + e.corrected.length);
      sentenceEnd = sentenceEnd === -1 ? text.length : sentenceEnd + 1;
      const sentence = text.slice(sentenceStart, sentenceEnd).trim();

      // Create the blank version
      const blankSentence = sentence.replace(
        new RegExp(e.corrected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
        '______'
      );

      return {
        id: e.id,
        errorType: e.errorType,
        original: e.original,
        corrected: e.corrected,
        sentence,
        blankSentence,
        attempts: e.attempts,
        correctCount: e.correctCount,
        successRate: e.successRate,
      };
    });
  },

  async validateErrorAnswer(errorId: string, answer: string) {
    const error = await prisma.error.findUnique({ where: { id: errorId } });
    if (!error) throw new Error('Error not found');

    const normalizedAnswer = answer.toLowerCase().trim().replace(/[.!?,;:]+$/, '');
    const normalizedCorrect = error.corrected.toLowerCase().trim().replace(/[.!?,;:]+$/, '');
    const correct = normalizedAnswer === normalizedCorrect;

    const newAttempts = error.attempts + 1;
    const newCorrectCount = correct ? error.correctCount + 1 : error.correctCount;
    const newSuccessRate = newAttempts > 0 ? Math.round((newCorrectCount / newAttempts) * 100 * 10) / 10 : 0;

    await prisma.error.update({
      where: { id: errorId },
      data: { attempts: newAttempts, correctCount: newCorrectCount, successRate: newSuccessRate },
    });

    return {
      correct,
      expectedAnswer: error.corrected,
      stats: { attempts: newAttempts, correctCount: newCorrectCount, successRate: newSuccessRate },
    };
  },

  async getErrorWords(languageId: string) {
    const topic = await prisma.topic.findFirst({
      where: { languageId, name: 'Errores de redacción' },
    });
    if (!topic) return [];

    return prisma.word.findMany({
      where: { topicId: topic.id, source: 'error' },
      orderBy: [{ successRate: 'asc' }, { occurrences: 'desc' }],
    });
  },

  async delete(id: string) {
    // Get the essay's errors before deleting
    const essay = await prisma.essay.findUnique({
      where: { id },
      include: { corrections: { include: { errors: true } } },
    });

    if (essay) {
      // Decrement occurrences or delete error words
      const topic = await prisma.topic.findFirst({
        where: { languageId: essay.languageId, name: 'Errores de redacción' },
      });

      if (topic) {
        for (const correction of essay.corrections) {
          for (const error of correction.errors) {
            const word = await prisma.word.findFirst({
              where: {
                topicId: topic.id,
                source: 'error',
                term: { equals: error.corrected, mode: 'insensitive' },
              },
            });

            if (word) {
              if (word.occurrences <= 1) {
                await prisma.word.delete({ where: { id: word.id } });
              } else {
                await prisma.word.update({
                  where: { id: word.id },
                  data: { occurrences: word.occurrences - 1 },
                });
              }
            }
          }
        }
      }
    }

    return prisma.essay.delete({ where: { id } });
  },

  async correctEssay(text: string, language: string): Promise<CorrectionResult> {
    const prompt = `Eres un profesor de ${language}. Corrige el siguiente texto y proporciona un análisis detallado de los errores.

Texto original:
${text}

Por favor, proporciona tu respuesta en el siguiente formato JSON:
{
  "correctedText": "texto corregido completo aquí",
  "feedback": "comentario general sobre el texto",
  "errors": [
    {
      "errorType": "accent" | "grammar" | "spelling" | "other",
      "original": "palabra o frase incorrecta",
      "corrected": "palabra o frase corregida",
      "explanation": "breve explicación del error",
      "position": número opcional indicando posición en el texto original
    }
  ]
}

Si no hay errores, devuelve un array vacío en "errors".`;

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Could not parse JSON from Claude response');
      }

      const result = JSON.parse(jsonMatch[0]) as CorrectionResult;

      return result;
    } catch (error) {
      console.error('Error calling Claude API:', error);
      throw new Error('Failed to correct essay');
    }
  },

  async getOrCreateErrorsTopic(languageId: string) {
    const errorTopicName = 'Errores de redacción';
    let topic = await prisma.topic.findFirst({
      where: { languageId, name: errorTopicName },
    });
    if (!topic) {
      topic = await prisma.topic.create({
        data: {
          name: errorTopicName,
          description: 'Errores detectados automáticamente en redacciones',
          languageId,
        },
      });
    }
    return topic;
  },

  async createErrorWords(languageId: string, errors: CorrectionResult['errors']) {
    const topic = await this.getOrCreateErrorsTopic(languageId);

    for (const error of errors) {
      const normalizedTerm = error.corrected.toLowerCase().trim();

      // Check if this error word already exists
      const existing = await prisma.word.findFirst({
        where: {
          topicId: topic.id,
          source: 'error',
          term: { equals: normalizedTerm, mode: 'insensitive' },
        },
      });

      if (existing) {
        // Increment occurrences
        await prisma.word.update({
          where: { id: existing.id },
          data: { occurrences: existing.occurrences + 1 },
        });
      } else {
        // Create new error word
        await prisma.word.create({
          data: {
            term: error.corrected,
            definition: error.explanation || `Forma correcta de "${error.original}"`,
            topicId: topic.id,
            source: 'error',
            occurrences: 1,
          },
        });
      }
    }
  },

  async convertErrorToWord(errorId: string, topicId: string) {
    const error = await prisma.error.findUnique({
      where: { id: errorId },
    });

    if (!error) {
      throw new Error('Error not found');
    }

    if (error.convertedToWord) {
      throw new Error('Error already converted to word');
    }

    const word = await prisma.word.create({
      data: {
        term: error.corrected,
        definition: error.explanation || `Forma correcta de "${error.original}"`,
        topicId,
      },
    });

    await prisma.error.update({
      where: { id: errorId },
      data: {
        convertedToWord: true,
        wordId: word.id,
      },
    });

    return word;
  },
};
