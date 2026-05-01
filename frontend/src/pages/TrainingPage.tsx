import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { X, Volume2, Calendar, Layers } from 'lucide-react';
import { trainingApi, topicsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import type { TrainingSession } from '../types';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ñ', 'ó', 'ù', '^'];
const BATCH_SIZE = 7;

type Phase = 'mc' | 'written';

interface WordInfo {
  wordId: string;
  definition: string;
  questionId: string; // for backend tracking
  source: 'vocabulary' | 'error';
}

export default function TrainingPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = searchParams.get('mode') as 'by-level' | 'by-topic';
  const topicId = searchParams.get('topicId');
  const languageId = searchParams.get('languageId');
  const sessionId = searchParams.get('sessionId');

  // Filter state
  const [trainingType, setTrainingType] = useState<'batch' | 'srs'>('batch');
  const [selectedTopicIds, setSelectedTopicIds] = useState<Set<string>>(new Set());
  const [minErrorRate, setMinErrorRate] = useState<number>(0);

  // Session state
  const [session, setSession] = useState<TrainingSession | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  // Batch learning state
  const [allWords, setAllWords] = useState<WordInfo[]>([]);
  const [learnedWordIds, setLearnedWordIds] = useState<Set<string>>(new Set());
  const [mcPassedIds, setMcPassedIds] = useState<Set<string>>(new Set());
  const [currentBatch, setCurrentBatch] = useState<WordInfo[]>([]);
  const [phase, setPhase] = useState<Phase>('mc');
  const [roundQueue, setRoundQueue] = useState<WordInfo[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedInRound, setFailedInRound] = useState<WordInfo[]>([]);
  const [showRetryBanner, setShowRetryBanner] = useState(false);
  const [isRetryRound, setIsRetryRound] = useState(false);

  // Current question state
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{
    correct: boolean;
    expectedAnswer?: string;
    userAnswer?: string;
  } | null>(null);
  const [isRetyping, setIsRetyping] = useState(false);
  const [retypeAnswer, setRetypeAnswer] = useState('');
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Stats
  const [totalLearned, setTotalLearned] = useState(0);
  const learnedIdsRef = useRef<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);

  const [loadingSession, setLoadingSession] = useState(!!sessionId);

  // Load session
  useEffect(() => {
    if (sessionId) {
      setLoadingSession(true);
      trainingApi.getSession(sessionId).then((data) => {
        initSession(data, sessionId);
        setLoadingSession(false);
      }).catch(() => setLoadingSession(false));
    }
  }, [sessionId]);

  const initSession = (data: TrainingSession, sid: string) => {
    setSession(data);
    setCurrentSessionId(sid);

    // Deduplicate words
    const seen = new Set<string>();
    const words: WordInfo[] = [];
    for (const q of data.questions) {
      if (!seen.has(q.wordId)) {
        seen.add(q.wordId);
        words.push({ wordId: q.wordId, definition: q.definition, questionId: q.id, source: q.source || 'vocabulary' });
      }
    }
    setAllWords(words);

    // Find already-learned words (both MC and written answered correctly)
    const answeredWords = new Set<string>();
    for (const q of data.questions) {
      if (q.answered && q.correct) {
        answeredWords.add(q.wordId);
      }
    }
    // A word is "learned" only if ALL its questions (MC + written) are answered correctly
    const mcAnswered = new Set(data.questions.filter(q => q.type === 'multiple_choice' && q.answered && q.correct).map(q => q.wordId));
    const writtenAnswered = new Set(data.questions.filter(q => q.type === 'written' && q.answered && q.correct).map(q => q.wordId));
    const alreadyLearned = new Set<string>();
    for (const wid of mcAnswered) {
      if (writtenAnswered.has(wid)) alreadyLearned.add(wid);
    }

    setLearnedWordIds(alreadyLearned);
    learnedIdsRef.current = alreadyLearned;
    setTotalLearned(alreadyLearned.size);

    // Track which words already passed MC (for skipping in resumed sessions)
    setMcPassedIds(mcAnswered);

    // Skip already-learned words, start from next batch
    const remaining = words.filter(w => !alreadyLearned.has(w.wordId));
    const firstBatch = remaining.slice(0, BATCH_SIZE);

    if (firstBatch.length === 0) {
      // All done already
      setCurrentBatch([]);
      return;
    }

    // Determine phase and queue
    const needsMc = firstBatch.filter(w => !mcAnswered.has(w.wordId));
    const needsWritten = firstBatch.filter(w => mcAnswered.has(w.wordId) && !writtenAnswered.has(w.wordId));

    let startPhase: Phase;
    let startQueue: WordInfo[];

    if (needsMc.length > 0) {
      // Some words still need MC
      startPhase = 'mc';
      startQueue = needsMc;
    } else if (needsWritten.length > 0) {
      // All MC done, some need written
      startPhase = 'written';
      startQueue = needsWritten;
    } else {
      // Shouldn't happen (would be learned), but fallback
      startPhase = 'mc';
      startQueue = firstBatch;
    }

    setCurrentBatch(firstBatch);
    setPhase(startPhase);
    setRoundQueue(startQueue);
    setCurrentIndex(0);
    setFailedInRound([]);
    setIsRetryRound(false);
  };

  // Fetch topics for selection
  const { data: topics } = useQuery({
    queryKey: ['topics', languageId],
    queryFn: () => topicsApi.getByLanguageId(languageId!),
    enabled: !!languageId && !session,
  });

  const startSessionMutation = useMutation({
    mutationFn: () =>
      trainingApi.createSession({
        mode: 'by-level',
        trainingType,
        topicIds: selectedTopicIds.size > 0 ? Array.from(selectedTopicIds).join(',') : undefined,
        languageId: languageId || undefined,
        limit: 10000,
        minErrorRate: minErrorRate > 0 ? minErrorRate : undefined,
      }),
    onSuccess: (data) => {
      initSession(data, data.sessionId);
    },
  });

  const validateMutation = useMutation({
    mutationFn: (data: { sessionId: string; wordId: string; answer: string }) =>
      trainingApi.validateAnswer(data),
  });

  // Current word
  const currentWord = roundQueue[currentIndex] || null;

  // Load MC options when in MC phase
  useEffect(() => {
    if (!currentWord || phase !== 'mc' || result) return;
    setLoadingOptions(true);
    setMultipleChoiceOptions([]);
    trainingApi.getMultipleChoiceOptions(currentWord.wordId).then((data) => {
      setMultipleChoiceOptions(data.options);
      setLoadingOptions(false);
    }).catch(() => setLoadingOptions(false));
  }, [currentWord?.wordId, phase, result, currentIndex]);

  // Focus input for written phase
  useEffect(() => {
    if (phase === 'written' && !result && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [currentIndex, phase, result, showRetryBanner]);

  // Keyboard: 1-4 for MC
  useEffect(() => {
    if (phase !== 'mc' || result || multipleChoiceOptions.length === 0) return;

    const handleKey = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= multipleChoiceOptions.length) {
        handleMCSelect(multipleChoiceOptions[num - 1]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [phase, result, multipleChoiceOptions, currentWord]);

  // Keyboard: Enter/Space to dismiss error and go to retype
  useEffect(() => {
    if (!result || result.correct || isRetyping) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        startRetype();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [result, isRetyping]);

  // Keyboard: Enter to dismiss retry banner
  useEffect(() => {
    if (!showRetryBanner) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismissRetryBanner();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showRetryBanner]);

  const handleMCSelect = useCallback((option: string) => {
    if (!currentWord || !currentSessionId) return;

    validateMutation.mutate(
      { sessionId: currentSessionId, wordId: currentWord.wordId, answer: option },
      {
        onSuccess: (data) => {
          if (data.correct) {
            setResult({ correct: true, expectedAnswer: data.expectedAnswer });
            setMcPassedIds((prev) => new Set(prev).add(currentWord.wordId));
            setTimeout(() => advanceToNext(), 500);
          } else {
            setResult({ correct: false, expectedAnswer: data.expectedAnswer, userAnswer: option });
            setFailedInRound((prev) => [...prev, currentWord]);
          }
        },
      }
    );
  }, [currentWord, currentSessionId]);

  const handleWrittenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWord || !currentSessionId) return;

    validateMutation.mutate(
      { sessionId: currentSessionId, wordId: currentWord.wordId, answer },
      {
        onSuccess: (data) => {
          if (data.correct) {
            setResult({ correct: true, expectedAnswer: data.expectedAnswer });
            // Word is fully learned (MC + written both passed)
            setLearnedWordIds((prev) => {
              const next = new Set(prev).add(currentWord.wordId);
              learnedIdsRef.current = next;
              setTotalLearned(next.size);
              return next;
            });
            setTimeout(() => advanceToNext(), 500);
          } else {
            setResult({ correct: false, expectedAnswer: data.expectedAnswer, userAnswer: answer });
            setFailedInRound((prev) => [...prev, currentWord]);
          }
        },
      }
    );
  };

  const startRetype = () => {
    setIsRetyping(true);
    setRetypeAnswer('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const handleRetypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!result?.expectedAnswer) return;

    const norm = (s: string) => s.toLowerCase().trim().replace(/[.!?,;:]+$/, '');
    if (norm(retypeAnswer) === norm(result.expectedAnswer)) {
      setResult({ ...result, correct: true });
      setTimeout(() => advanceToNext(), 500);
    } else {
      setRetypeAnswer('');
    }
  };

  const advanceToNext = () => {
    setResult(null);
    setAnswer('');
    setIsRetyping(false);
    setRetypeAnswer('');

    const nextIndex = currentIndex + 1;

    if (nextIndex < roundQueue.length) {
      // More words in this round
      setCurrentIndex(nextIndex);
    } else {
      // Round finished
      if (failedInRound.length > 0) {
        // Show retry banner, then retry failed words
        setShowRetryBanner(true);
      } else {
        // All passed in this round
        finishPhase();
      }
    }
  };

  const dismissRetryBanner = () => {
    setShowRetryBanner(false);
    setRoundQueue([...failedInRound]);
    setFailedInRound([]);
    setCurrentIndex(0);
    setIsRetryRound(true);
  };

  const finishPhase = () => {
    if (phase === 'mc') {
      // Switch to written phase — only words not already learned
      const learned = learnedIdsRef.current;
      const needsWritten = currentBatch.filter(w => !learned.has(w.wordId));
      if (needsWritten.length === 0) {
        loadNextBatch();
        return;
      }
      setPhase('written');
      setRoundQueue(needsWritten);
      setCurrentIndex(0);
      setFailedInRound([]);
      setIsRetryRound(false);
    } else {
      // Written phase done — load next batch
      loadNextBatch();
    }
  };

  const loadNextBatch = () => {
    const learned = learnedIdsRef.current;
    const nextWords = allWords.filter((w) => !learned.has(w.wordId));
    const nextBatch = nextWords.slice(0, BATCH_SIZE);

    if (nextBatch.length === 0) {
      // All done!
      if (currentSessionId) {
        trainingApi.endSession(currentSessionId).catch(() => {});
      }
      return;
    }

    setCurrentBatch(nextBatch);
    setPhase('mc');
    setMcPassedIds(new Set());
    setRoundQueue(nextBatch);
    setCurrentIndex(0);
    setFailedInRound([]);
    setIsRetryRound(false);
  };

  const isAllDone = session && allWords.length > 0 && totalLearned >= allWords.length;
  const noMoreBatches = session && !currentWord && !showRetryBanner && !isAllDone;

  const insertChar = (char: string) => {
    if (isRetyping) {
      setRetypeAnswer((prev) => prev + char);
    } else {
      setAnswer((prev) => prev + char);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // ---- RENDERS ----

  if (loadingSession) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-muted-foreground">Cargando entrenamiento...</div>
      </div>
    );
  }

  if (!session) {
    const toggleTopic = (id: string) => {
      setSelectedTopicIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
    };

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8 space-y-6">
            <h2 className="text-2xl font-bold text-center">Configurar entrenamiento</h2>

            {/* Training type */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Tipo de entrenamiento</p>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant={trainingType === 'batch' ? 'default' : 'outline'}
                  className="h-auto py-4 flex flex-col gap-1"
                  onClick={() => setTrainingType('batch')}
                >
                  <Layers className="w-6 h-6" />
                  <span className="font-medium">Batch</span>
                  <span className="text-xs opacity-70">Aprender palabras nuevas</span>
                </Button>
                <Button
                  variant={trainingType === 'srs' ? 'default' : 'outline'}
                  className="h-auto py-4 flex flex-col gap-1"
                  onClick={() => setTrainingType('srs')}
                >
                  <Calendar className="w-6 h-6" />
                  <span className="font-medium">Repaso (SRS)</span>
                  <span className="text-xs opacity-70">Repasar lo aprendido</span>
                </Button>
              </div>
            </div>

            {/* Topic selection */}
            {topics && topics.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Topics (vacío = todos)</p>
                <div className="max-h-48 overflow-y-auto border rounded-lg p-2 space-y-1">
                  {topics.map((topic) => (
                    <div
                      key={topic.id}
                      className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer"
                      onClick={() => toggleTopic(topic.id)}
                    >
                      <Checkbox
                        checked={selectedTopicIds.has(topic.id)}
                        onCheckedChange={() => toggleTopic(topic.id)}
                      />
                      <span className="text-sm flex-1">{topic.name}</span>
                      <Badge variant="secondary" className="text-xs">{topic.wordsCount}</Badge>
                    </div>
                  ))}
                </div>
                {selectedTopicIds.size > 0 && (
                  <p className="text-xs text-muted-foreground">{selectedTopicIds.size} topic{selectedTopicIds.size !== 1 ? 's' : ''} seleccionado{selectedTopicIds.size !== 1 ? 's' : ''}</p>
                )}
              </div>
            )}

            {/* Error rate filter */}
            <div className="space-y-2">
              <p className="text-sm font-medium">Filtrar por tasa de error mínima</p>
              <p className="text-xs text-muted-foreground">Solo palabras con error rate ≥ este valor (0 = todas, las no entrenadas siempre se incluyen)</p>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="10"
                  value={minErrorRate}
                  onChange={(e) => setMinErrorRate(parseInt(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm font-medium w-12 text-right">{minErrorRate}%</span>
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button
                onClick={() => startSessionMutation.mutate()}
                disabled={startSessionMutation.isPending}
                size="lg"
              >
                {startSessionMutation.isPending ? 'Preparando...' : 'Comenzar'}
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate(-1)}>
                Volver
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Finished all words
  if (isAllDone || noMoreBatches) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-12 pb-12 text-center">
            <h2 className="text-3xl font-bold mb-6">¡Entrenamiento Completado!</h2>
            <div className="text-6xl font-bold mb-4">
              {totalLearned} / {allWords.length}
            </div>
            <div className="text-2xl text-muted-foreground mb-8">
              palabras aprendidas
            </div>
            <div className="flex gap-3 justify-center">
              <Button
                size="lg"
                onClick={() => {
                  if (languageId) navigate(`/languages/${languageId}/training-sessions`);
                  else navigate(-1);
                }}
              >
                Volver a entrenamientos
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Retry banner
  if (showRetryBanner) {
    return (
      <div className="min-h-screen bg-background">
        <Header navigate={navigate} />
        <ProgressBar totalLearned={totalLearned} totalWords={allWords.length} />
        <div className="max-w-5xl mx-auto px-6">
          <Card>
            <CardContent className="pt-12 pb-12 text-center space-y-6">
              <div className="text-orange-500 text-5xl mb-4">
                &#x21bb;
              </div>
              <h2 className="text-2xl font-bold">Vuelve a intentarlo</h2>
              <p className="text-muted-foreground">
                {failedInRound.length} palabra{failedInRound.length !== 1 ? 's' : ''} para repasar
              </p>
              <Button size="lg" onClick={dismissRetryBanner}>
                Continuar
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="min-h-screen bg-background">
      <Header navigate={navigate} />
      <ProgressBar totalLearned={totalLearned} totalWords={allWords.length} />

      {/* Batch info */}
      <div className="max-w-5xl mx-auto px-6 mb-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {phase === 'mc' ? 'Opción múltiple' : 'Escrita'}
            {isRetryRound ? ' — repaso' : ''}
          </span>
          <span>
            {currentIndex + 1}/{roundQueue.length}
          </span>
        </div>
      </div>

      {/* Question Card */}
      <div className="max-w-5xl mx-auto px-6">
        <Card>
          <CardContent className="pt-12 pb-12">
            {!result ? (
              <>
                {/* Definition */}
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-sm font-medium text-muted-foreground">Definición</span>
                    {currentWord.source === 'error' && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                        Error de redacción
                      </span>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <Volume2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="text-3xl font-medium mb-8">
                    {currentWord.definition}
                  </div>
                </div>

                {phase === 'mc' ? (
                  /* Multiple Choice */
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Selecciona una respuesta</p>
                    {loadingOptions ? (
                      <div className="text-center py-8 text-muted-foreground">Cargando opciones...</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {multipleChoiceOptions.map((option, index) => (
                          <Button
                            key={index}
                            type="button"
                            variant="outline"
                            className="h-auto py-4 px-6 text-left justify-start text-lg"
                            disabled={validateMutation.isPending}
                            onClick={() => handleMCSelect(option)}
                          >
                            <span className="flex items-center gap-3 w-full">
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">
                                {index + 1}
                              </span>
                              <span className="flex-1">{option}</span>
                            </span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Written */
                  <form onSubmit={handleWrittenSubmit} className="space-y-6">
                    <div className="space-y-2">
                      <span className="text-sm text-muted-foreground">Tu respuesta</span>

                      <div className="flex gap-1 mb-3 flex-wrap">
                        {FRENCH_CHARS.map((char) => (
                          <Button
                            key={char}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => insertChar(char)}
                          >
                            {char}
                          </Button>
                        ))}
                      </div>

                      <Input
                        ref={inputRef}
                        type="text"
                        value={answer}
                        onChange={(e) => setAnswer(e.target.value)}
                        placeholder="Escribe la respuesta"
                        autoFocus
                        className="text-lg py-6"
                      />
                    </div>

                    <div className="flex justify-end pt-4">
                      <Button type="submit" size="lg" disabled={validateMutation.isPending}>
                        Responder
                      </Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                {/* Result */}
                {result.correct ? (
                  <div className="text-center space-y-6">
                    <div className="text-3xl font-bold text-green-600 animate-in fade-in zoom-in duration-300">
                      ¡Correcto!
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {!isRetyping ? (
                      <>
                        <p className="text-orange-600 font-medium">
                          ¡No hay problema, todavía estás aprendiendo!
                        </p>

                        {/* User's wrong answer */}
                        <div className="border-2 border-orange-400 bg-orange-50 dark:bg-orange-950/20 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <X className="w-5 h-5 text-orange-600 mt-1 flex-shrink-0" />
                            <span className="text-lg">{result.userAnswer}</span>
                          </div>
                        </div>

                        {/* Correct answer */}
                        <div>
                          <p className="text-sm font-medium text-foreground mb-2">Respuesta correcta</p>
                          <div className="border-2 border-green-600 border-dashed bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
                            <span className="text-lg font-medium">{result.expectedAnswer}</span>
                          </div>
                        </div>

                        <p className="text-sm text-muted-foreground">
                          Pulsa Enter para volver a escribirla
                        </p>

                        <Button size="lg" onClick={startRetype} className="w-full">
                          Volver a escribirla
                        </Button>
                      </>
                    ) : (
                      <>
                        {/* Retype the correct answer */}
                        <div>
                          <p className="text-sm font-medium text-foreground mb-2">Respuesta correcta</p>
                          <div className="border-2 border-green-600 border-dashed bg-green-50 dark:bg-green-950/20 rounded-lg p-4">
                            <span className="text-lg font-medium">{result.expectedAnswer}</span>
                          </div>
                        </div>

                        <p className="text-sm text-foreground font-medium">
                          Vuelve a escribir la respuesta correcta
                        </p>

                        <div className="flex gap-1 flex-wrap">
                          {FRENCH_CHARS.map((char) => (
                            <Button
                              key={char}
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => insertChar(char)}
                            >
                              {char}
                            </Button>
                          ))}
                        </div>

                        <form onSubmit={handleRetypeSubmit} className="space-y-4">
                          <Input
                            ref={inputRef}
                            type="text"
                            value={retypeAnswer}
                            onChange={(e) => setRetypeAnswer(e.target.value)}
                            placeholder="Escribe la respuesta"
                            autoFocus
                            required
                            className="text-lg py-6"
                          />
                          <Button type="submit" size="lg" className="w-full">
                            Comprobar
                          </Button>
                        </form>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Header({ navigate }: { navigate: (delta: number) => void }) {
  return (
    <div className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="bg-primary/10 p-2 rounded-lg">
          <span className="text-lg font-semibold">Aprender</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <X className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}

function ProgressBar({ totalLearned, totalWords }: { totalLearned: number; totalWords: number }) {
  const pct = totalWords > 0 ? (totalLearned / totalWords) * 100 : 0;
  return (
    <div className="max-w-5xl mx-auto px-6 py-6">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          {totalLearned}/{totalWords}
        </span>
      </div>
    </div>
  );
}
