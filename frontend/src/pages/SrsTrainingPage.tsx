import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { X, Calendar, Star } from 'lucide-react';
import { srsApi, trainingApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import type { Word } from '../types';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ñ', 'ó', 'ù', '^'];
const BATCH_SIZE = 7;

const SRS_LEVEL_LABELS: Record<number, string> = {
  0: 'Nuevo',
  1: '3 días',
  2: '7 días',
  3: '15 días',
  4: '30 días',
  5: '90 días',
  6: 'Dominado',
};

type Phase = 'mc' | 'written';

export default function SrsTrainingPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Session data
  const [started, setStarted] = useState(false);
  const [allWords, setAllWords] = useState<Word[]>([]);
  const [currentBatch, setCurrentBatch] = useState<Word[]>([]);
  const [phase, setPhase] = useState<Phase>('mc');
  const [roundQueue, setRoundQueue] = useState<Word[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedInRound, setFailedInRound] = useState<Word[]>([]);
  const [showRetryBanner, setShowRetryBanner] = useState(false);
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set());
  const learnedRef = useRef<Set<string>>(new Set());
  const [mcPassedIds, setMcPassedIds] = useState<Set<string>>(new Set());
  const [totalLearned, setTotalLearned] = useState(0);

  // Question state
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ correct: boolean; expectedAnswer: string; userAnswer?: string } | null>(null);
  const [isRetyping, setIsRetyping] = useState(false);
  const [retypeAnswer, setRetypeAnswer] = useState('');
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  // Fetch daily session
  const { data: dailySession, isLoading } = useQuery({
    queryKey: ['srs-daily', languageId],
    queryFn: () => srsApi.getDailySession(languageId!),
    enabled: !!languageId,
  });

  const validateMutation = useMutation({
    mutationFn: (data: { sessionId: string; wordId: string; answer: string }) =>
      trainingApi.validateAnswer(data),
  });

  const currentWord = roundQueue[currentIndex] || null;

  // Load MC options
  useEffect(() => {
    if (!currentWord || phase !== 'mc' || result) return;
    setLoadingOptions(true);
    setMultipleChoiceOptions([]);
    trainingApi.getMultipleChoiceOptions(currentWord.id).then((data) => {
      setMultipleChoiceOptions(data.options);
      setLoadingOptions(false);
    }).catch(() => setLoadingOptions(false));
  }, [currentWord?.id, phase, result, currentIndex]);

  // Focus input
  useEffect(() => {
    if (phase === 'written' && !result && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [currentIndex, phase, result, showRetryBanner]);

  // Keyboard: 1-4 for MC
  useEffect(() => {
    if (phase !== 'mc' || result || multipleChoiceOptions.length === 0) return;
    const handler = (e: KeyboardEvent) => {
      const num = parseInt(e.key);
      if (num >= 1 && num <= multipleChoiceOptions.length) handleMCSelect(multipleChoiceOptions[num - 1]);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [phase, result, multipleChoiceOptions, currentWord]);

  // Keyboard: Enter for error retype
  useEffect(() => {
    if (!result || result.correct || isRetyping) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); setIsRetyping(true); setRetypeAnswer(''); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [result, isRetyping]);

  // Keyboard: Enter for retry banner
  useEffect(() => {
    if (!showRetryBanner) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); dismissRetryBanner(); } };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showRetryBanner]);

  const handleStart = () => {
    if (!dailySession) return;
    const words = [...dailySession.dueWords, ...dailySession.newWords];
    if (words.length === 0) return;
    setAllWords(words);
    const batch = words.slice(0, BATCH_SIZE);
    setCurrentBatch(batch);
    setPhase('mc');
    setRoundQueue(batch);
    setCurrentIndex(0);
    setStarted(true);
  };

  const handleMCSelect = useCallback((option: string) => {
    if (!currentWord) return;
    // For SRS, we validate locally (compare with term)
    const correct = option.toLowerCase().trim() === currentWord.term.toLowerCase().trim();
    if (correct) {
      setResult({ correct: true, expectedAnswer: currentWord.term });
      setMcPassedIds(prev => new Set(prev).add(currentWord.id));
      // Update SRS
      srsApi.advanceWord(currentWord.id).catch(() => {});
      setTimeout(() => advanceToNext(), 500);
    } else {
      setResult({ correct: false, expectedAnswer: currentWord.term, userAnswer: option });
      setFailedInRound(prev => [...prev, currentWord]);
      srsApi.resetWord(currentWord.id).catch(() => {});
    }
  }, [currentWord]);

  const handleWrittenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWord) return;
    const norm = (s: string) => s.toLowerCase().trim().replace(/[.!?,;:]+$/, '');
    const correct = norm(answer) === norm(currentWord.term);

    if (correct) {
      setResult({ correct: true, expectedAnswer: currentWord.term });
      setLearnedIds(prev => {
        const next = new Set(prev).add(currentWord.id);
        learnedRef.current = next;
        setTotalLearned(next.size);
        return next;
      });
      srsApi.advanceWord(currentWord.id).catch(() => {});
      setTimeout(() => advanceToNext(), 500);
    } else {
      setResult({ correct: false, expectedAnswer: currentWord.term, userAnswer: answer });
      setFailedInRound(prev => [...prev, currentWord]);
      srsApi.resetWord(currentWord.id).catch(() => {});
    }
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
    setResult(null); setAnswer(''); setIsRetyping(false); setRetypeAnswer('');
    if (currentIndex + 1 < roundQueue.length) {
      setCurrentIndex(currentIndex + 1);
    } else if (failedInRound.length > 0) {
      setShowRetryBanner(true);
    } else {
      finishPhase();
    }
  };

  const dismissRetryBanner = () => {
    setShowRetryBanner(false);
    setRoundQueue([...failedInRound]);
    setFailedInRound([]);
    setCurrentIndex(0);
  };

  const finishPhase = () => {
    if (phase === 'mc') {
      const learned = learnedRef.current;
      const needsWritten = currentBatch.filter(w => !learned.has(w.id));
      if (needsWritten.length === 0) { loadNextBatch(); return; }
      setPhase('written');
      setRoundQueue(needsWritten);
      setCurrentIndex(0);
      setFailedInRound([]);
    } else {
      loadNextBatch();
    }
  };

  const loadNextBatch = () => {
    const learned = learnedRef.current;
    const remaining = allWords.filter(w => !learned.has(w.id));
    const batch = remaining.slice(0, BATCH_SIZE);
    if (batch.length === 0) return;
    setCurrentBatch(batch);
    setPhase('mc');
    setMcPassedIds(new Set());
    setRoundQueue(batch);
    setCurrentIndex(0);
    setFailedInRound([]);
  };

  const insertChar = (char: string) => {
    if (isRetyping) setRetypeAnswer(prev => prev + char);
    else setAnswer(prev => prev + char);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const isAllDone = started && allWords.length > 0 && totalLearned >= allWords.length;
  const noMoreBatches = started && !currentWord && !showRetryBanner && !isAllDone;

  // --- RENDERS ---

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Cargando...</div></div>;
  }

  // Pre-start screen
  if (!started) {
    const summary = dailySession?.summary;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-bold">Repaso diario (SRS)</h2>
              <p className="text-muted-foreground mt-2">Repasa las palabras que te tocan hoy</p>
            </div>

            {summary && (
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-blue-600">{summary.newCount}</p>
                  <p className="text-sm text-muted-foreground">Palabras nuevas</p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg text-center">
                  <p className="text-3xl font-bold text-amber-600">{summary.dueCount}</p>
                  <p className="text-sm text-muted-foreground">Para repasar</p>
                </div>
              </div>
            )}

            {summary && summary.dueCount > 0 && Object.keys(summary.dueByLevel).length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Repaso por nivel:</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(summary.dueByLevel).map(([level, count]) => (
                    <Badge key={level} variant="secondary">
                      {SRS_LEVEL_LABELS[parseInt(level)] || `Nivel ${level}`}: {count as number}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 justify-center pt-2">
              <Button
                onClick={handleStart}
                size="lg"
                disabled={!summary || summary.totalCount === 0}
              >
                {summary?.totalCount === 0 ? 'No hay palabras para hoy' : `Comenzar (${summary?.totalCount} palabras)`}
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate(-1)}>Volver</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Finished
  if (isAllDone || noMoreBatches) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-12 pb-12 text-center">
            <Star className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
            <h2 className="text-3xl font-bold mb-4">¡Repaso completado!</h2>
            <p className="text-xl text-muted-foreground mb-8">{totalLearned} palabras repasadas</p>
            <Button size="lg" onClick={() => navigate(-1)}>Volver</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Retry banner
  if (showRetryBanner) {
    return (
      <div className="min-h-screen bg-background">
        <SrsHeader navigate={navigate} totalLearned={totalLearned} totalWords={allWords.length} />
        <div className="max-w-5xl mx-auto px-6 pt-8">
          <Card><CardContent className="pt-12 pb-12 text-center space-y-6">
            <div className="text-orange-500 text-5xl">&#x21bb;</div>
            <h2 className="text-2xl font-bold">Vuelve a intentarlo</h2>
            <p className="text-muted-foreground">{failedInRound.length} palabra{failedInRound.length !== 1 ? 's' : ''}</p>
            <Button size="lg" onClick={dismissRetryBanner}>Continuar</Button>
          </CardContent></Card>
        </div>
      </div>
    );
  }

  if (!currentWord) return null;

  return (
    <div className="min-h-screen bg-background">
      <SrsHeader navigate={navigate} totalLearned={totalLearned} totalWords={allWords.length} />

      <div className="max-w-5xl mx-auto px-6 mb-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>{phase === 'mc' ? 'Opción múltiple' : 'Escrita'}</span>
            <Badge variant="secondary" className="text-xs">
              SRS {SRS_LEVEL_LABELS[currentWord.srsLevel] || 'Nuevo'}
            </Badge>
          </div>
          <span>{currentIndex + 1}/{roundQueue.length}</span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6">
        <Card>
          <CardContent className="pt-12 pb-12">
            {!result ? (
              <>
                <div className="mb-8">
                  <span className="text-sm text-muted-foreground">Definición</span>
                  <div className="text-3xl font-medium mt-2 mb-8">{currentWord.definition}</div>
                </div>

                {phase === 'mc' ? (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">Selecciona una respuesta</p>
                    {loadingOptions ? (
                      <div className="text-center py-8 text-muted-foreground">Cargando...</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {multipleChoiceOptions.map((option, i) => (
                          <Button key={i} type="button" variant="outline" className="h-auto py-4 px-6 text-left justify-start text-lg" onClick={() => handleMCSelect(option)}>
                            <span className="flex items-center gap-3 w-full">
                              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{i + 1}</span>
                              <span className="flex-1">{option}</span>
                            </span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <form onSubmit={handleWrittenSubmit} className="space-y-6">
                    <span className="text-sm text-muted-foreground">Tu respuesta</span>
                    <div className="flex gap-1 mb-3 flex-wrap">
                      {FRENCH_CHARS.map(c => (
                        <Button key={c} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(c)}>{c}</Button>
                      ))}
                    </div>
                    <Input ref={inputRef} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Escribe la respuesta" autoFocus className="text-lg py-6" />
                    <div className="flex justify-end">
                      <Button type="submit" size="lg">Responder</Button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                {result.correct ? (
                  <div className="text-center"><div className="text-3xl font-bold text-green-600">¡Correcto!</div></div>
                ) : (
                  <div className="space-y-6">
                    {!isRetyping ? (
                      <>
                        <p className="text-orange-600 font-medium">¡No hay problema!</p>
                        <div className="border-2 border-orange-400 bg-orange-50 rounded-lg p-4">
                          <X className="w-5 h-5 text-orange-600 inline mr-2" /><span className="text-lg">{result.userAnswer}</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-2">Respuesta correcta</p>
                          <div className="border-2 border-green-600 border-dashed bg-green-50 rounded-lg p-4">
                            <span className="text-lg font-medium">{result.expectedAnswer}</span>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">Pulsa Enter para volver a escribirla</p>
                      </>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-medium mb-2">Respuesta correcta</p>
                          <div className="border-2 border-green-600 border-dashed bg-green-50 rounded-lg p-4">
                            <span className="text-lg font-medium">{result.expectedAnswer}</span>
                          </div>
                        </div>
                        <p className="text-sm font-medium">Vuelve a escribirla</p>
                        <div className="flex gap-1 flex-wrap">
                          {FRENCH_CHARS.map(c => (
                            <Button key={c} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(c)}>{c}</Button>
                          ))}
                        </div>
                        <form onSubmit={handleRetypeSubmit} className="space-y-4">
                          <Input ref={inputRef} value={retypeAnswer} onChange={e => setRetypeAnswer(e.target.value)} placeholder="Escribe" autoFocus required className="text-lg py-6" />
                          <Button type="submit" size="lg" className="w-full">Comprobar</Button>
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

function SrsHeader({ navigate, totalLearned, totalWords }: { navigate: (n: number) => void; totalLearned: number; totalWords: number }) {
  const pct = totalWords > 0 ? (totalLearned / totalWords) * 100 : 0;
  return (
    <>
      <div className="border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-primary" />
            <span className="text-lg font-semibold">Repaso diario</span>
          </div>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><X className="w-5 h-5" /></Button>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{totalLearned}/{totalWords}</span>
        </div>
      </div>
    </>
  );
}
