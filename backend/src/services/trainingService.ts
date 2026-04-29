import { prisma } from '../utils/prisma';
import { TrainingSessionParams, ValidateAnswerDto } from '../types';
import { validateAnswer } from '../utils/validation';
import { wordService } from './wordService';
import { srsService } from './srsService';

interface TrainingSessionResponse {
  sessionId: string;
  mode: string;
  totalQuestions: number;
  currentIndex: number;
  questions: {
    id: string;
    wordId: string;
    definition: string;
    order: number;
    type: 'multiple_choice' | 'written';
    answered: boolean;
    source: string;
  }[];
}

export const trainingService = {
  async listSessions(languageId: string) {
    const sessions = await prisma.trainingSession.findMany({
      where: { languageId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return sessions.map((s) => {
      // Count unique words, not raw questions (each word has MC + written = 2 questions)
      const uniqueWordIds = new Set(s.questions.map((q) => q.wordId));
      const totalWords = uniqueWordIds.size;

      // A word is "learned" if both MC and written are answered correctly
      const mcCorrect = new Set(s.questions.filter((q) => q.type === 'multiple_choice' && q.answered && q.correct).map((q) => q.wordId));
      const writtenCorrect = new Set(s.questions.filter((q) => q.type === 'written' && q.answered && q.correct).map((q) => q.wordId));
      const learnedWords = [...mcCorrect].filter((wid) => writtenCorrect.has(wid)).length;

      const answered = s.questions.filter((q) => q.answered);
      const correct = answered.filter((q) => q.correct);

      return {
        sessionId: s.id,
        name: s.name,
        mode: s.mode,
        trainingType: s.trainingType || 'batch',
        totalQuestions: s.totalQuestions,
        currentIndex: s.currentIndex,
        completed: s.completed,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        stats: {
          answered: learnedWords,
          correct: correct.length,
          total: totalWords,
          accuracy: answered.length > 0 ? Math.round((correct.length / answered.length) * 100) : 0,
        },
      };
    });
  },

  async renameSession(sessionId: string, name: string) {
    return prisma.trainingSession.update({
      where: { id: sessionId },
      data: { name },
    });
  },

  async deleteSession(sessionId: string) {
    return prisma.trainingSession.delete({
      where: { id: sessionId },
    });
  },

  async createSession(params: TrainingSessionParams): Promise<TrainingSessionResponse> {
    const {
      mode, topicId, topicIds, languageId, limit = 20,
      trainingType = 'batch', minErrorRate,
    } = params;
    let words;

    if (!languageId) throw new Error('languageId is required');

    // Determine which topics to use
    let targetTopicIds: string[] = [];
    if (topicIds) {
      targetTopicIds = topicIds.split(',').map(id => id.trim());
    } else if (topicId) {
      targetTopicIds = [topicId];
    }

    // Fetch words from selected topics (or all if none specified)
    const topicFilter: any = { languageId };
    if (targetTopicIds.length > 0) {
      topicFilter.id = { in: targetTopicIds };
    }
    // Exclude error topic
    topicFilter.name = { not: 'Errores de redacción' };

    const topics = await prisma.topic.findMany({
      where: topicFilter,
      include: { words: { where: { source: 'vocabulary' } } },
    });

    let allWords = topics.flatMap((t) => t.words);

    // Filter by error rate: include words with successRate <= threshold OR untrained (attempts === 0)
    if (minErrorRate !== undefined && minErrorRate > 0) {
      const maxSuccessRate = 100 - minErrorRate;
      allWords = allWords.filter(w => w.attempts === 0 || w.successRate <= maxSuccessRate);
    }

    // For SRS mode: only get words due for review + new words
    if (trainingType === 'srs') {
      const now = new Date();
      const todayEnd = new Date(now);
      todayEnd.setHours(23, 59, 59, 999);

      const dueWords = allWords.filter(w =>
        w.srsLevel > 0 && w.nextReviewAt && w.nextReviewAt <= todayEnd
      );
      const newWords = allWords.filter(w =>
        w.srsLevel === 0 && !w.lastTrainedAt
      ).slice(0, 7);

      allWords = [...dueWords, ...newWords];
    }

    // Sort by difficulty
    allWords.sort((a, b) => {
      if (a.successRate !== b.successRate) return a.successRate - b.successRate;
      if (a.attempts !== b.attempts) return a.attempts - b.attempts;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    words = allWords.slice(0, limit);

    const sessionId = crypto.randomUUID();

    // Create questions in blocks of 10: first all multiple choice, then all written
    const BLOCK_SIZE = 10;
    const questions: TrainingSession['questions'] = [];
    let orderCounter = 1;

    // Process words in blocks of 10
    for (let i = 0; i < words.length; i += BLOCK_SIZE) {
      const block = words.slice(i, i + BLOCK_SIZE);

      // First, add all multiple choice questions for this block
      for (const word of block) {
        questions.push({
          id: crypto.randomUUID(),
          wordId: word.id,
          definition: word.definition,
          source: word.source || 'vocabulary',
          order: orderCounter++,
          type: 'multiple_choice',
        });
      }

      // Then, add all written questions for the same block
      for (const word of block) {
        questions.push({
          id: crypto.randomUUID(),
          wordId: word.id,
          definition: word.definition,
          source: word.source || 'vocabulary',
          order: orderCounter++,
          type: 'written',
        });
      }
    }

    // Save session to database
    const dbSession = await prisma.trainingSession.create({
      data: {
        id: sessionId,
        languageId,
        mode,
        trainingType,
        topicId: topicId || null,
        topicIds: targetTopicIds.length > 0 ? targetTopicIds.join(',') : null,
        minErrorRate: minErrorRate || null,
        totalQuestions: questions.length,
        currentIndex: 0,
        questions: {
          create: questions.map((q) => ({
            id: q.id,
            wordId: q.wordId,
            order: q.order,
            type: q.type,
          })),
        },
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    return {
      sessionId: dbSession.id,
      mode: dbSession.mode,
      totalQuestions: dbSession.totalQuestions,
      currentIndex: dbSession.currentIndex,
      questions: dbSession.questions.map((q) => ({
        id: q.id,
        wordId: q.wordId,
        definition: questions.find((qq) => qq.wordId === q.wordId)?.definition || '',
        order: q.order,
        type: q.type as 'multiple_choice' | 'written',
        answered: q.answered,
        correct: q.correct,
        source: questions.find((qq) => qq.wordId === q.wordId)?.source || 'vocabulary',
      })),
    };
  },

  async getSession(sessionId: string): Promise<TrainingSessionResponse | null> {
    const dbSession = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!dbSession) {
      return null;
    }

    // Get word definitions for all questions
    const wordIds = dbSession.questions.map((q) => q.wordId);
    const words = await prisma.word.findMany({
      where: { id: { in: wordIds } },
    });

    const wordMap = new Map(words.map((w) => [w.id, w]));

    return {
      sessionId: dbSession.id,
      mode: dbSession.mode,
      totalQuestions: dbSession.totalQuestions,
      currentIndex: dbSession.currentIndex,
      questions: dbSession.questions.map((q) => ({
        id: q.id,
        wordId: q.wordId,
        definition: wordMap.get(q.wordId)?.definition || '',
        order: q.order,
        type: q.type as 'multiple_choice' | 'written',
        answered: q.answered,
        correct: q.correct,
        source: wordMap.get(q.wordId)?.source || 'vocabulary',
      })),
    };
  },

  async updateSessionProgress(sessionId: string, currentIndex: number) {
    await prisma.trainingSession.update({
      where: { id: sessionId },
      data: { currentIndex },
    });
  },

  async validateAnswer(data: ValidateAnswerDto) {
    const { sessionId, wordId, answer } = data;

    const word = await prisma.word.findUnique({
      where: { id: wordId },
    });

    if (!word) {
      throw new Error('Word not found');
    }

    const correct = validateAnswer(answer, word.term);

    // Update word statistics
    const updatedWord = await wordService.updateStats(wordId, correct);

    // Mark question as answered in session
    const session = await prisma.trainingSession.findUnique({
      where: { id: sessionId },
      include: { questions: true },
    });

    if (session) {
      // First try: find an unanswered question for this word
      let question = session.questions.find((q) => q.wordId === wordId && !q.answered);
      if (question) {
        await prisma.trainingSessionQuestion.update({
          where: { id: question.id },
          data: {
            answered: true,
            correct,
          },
        });
      } else if (correct) {
        // Retry case: word was previously answered wrong, now correct — update it
        const wrongQuestion = session.questions.find((q) => q.wordId === wordId && q.answered && !q.correct);
        if (wrongQuestion) {
          await prisma.trainingSessionQuestion.update({
            where: { id: wrongQuestion.id },
            data: { correct: true },
          });
        }
      }

      // Check if word is now fully learned (both MC + written correct)
      const updatedQuestions = await prisma.trainingSessionQuestion.findMany({
        where: { sessionId, wordId },
      });
      const mcOk = updatedQuestions.some(q => q.type === 'multiple_choice' && q.answered && q.correct);
      const wrOk = updatedQuestions.some(q => q.type === 'written' && q.answered && q.correct);
      if (mcOk && wrOk) {
        // Word fully learned — initiate SRS schedule
        await srsService.initFromBatchTraining(wordId).catch(() => {});
      }

      // Update current index
      const currentIndex = session.questions.filter((q) => q.answered).length;
      await prisma.trainingSession.update({
        where: { id: sessionId },
        data: {
          currentIndex,
          completed: currentIndex >= session.totalQuestions,
        },
      });
    }

    return {
      correct,
      expectedAnswer: word.term,
      explanation: correct ? null : `La respuesta correcta es "${word.term}"`,
      stats: {
        attempts: updatedWord.attempts,
        correctCount: updatedWord.correctCount,
        successRate: updatedWord.successRate,
      },
    };
  },

  async endSession(sessionId: string) {
    await prisma.trainingSession.update({
      where: { id: sessionId },
      data: { completed: true },
    });
  },

  async generateMultipleChoiceOptions(wordId: string) {
    // Get the correct word
    const correctWord = await prisma.word.findUnique({
      where: { id: wordId },
      include: { topic: true },
    });

    if (!correctWord) {
      throw new Error('Word not found');
    }

    // Get 3 random words from the same language as distractors
    const allWordsFromLanguage = await prisma.word.findMany({
      where: {
        topic: {
          languageId: correctWord.topic.languageId,
        },
        id: {
          not: wordId, // Exclude the correct word
        },
      },
    });

    // Shuffle and pick 3 random words as distractors
    const shuffled = allWordsFromLanguage.sort(() => 0.5 - Math.random());
    const distractors = shuffled.slice(0, 3).map((w) => w.term);

    // Create options array with correct answer and distractors
    const options = [correctWord.term, ...distractors];

    // Shuffle the options so correct answer is not always first
    const shuffledOptions = options.sort(() => 0.5 - Math.random());

    return {
      options: shuffledOptions,
      correctAnswer: correctWord.term,
    };
  },
};
