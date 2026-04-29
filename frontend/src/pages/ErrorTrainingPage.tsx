import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { X, Check } from 'lucide-react';
import { essaysApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ñ', 'ó', 'ù', '^'];
const BATCH_SIZE = 7;

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  accent: { label: 'Acento', color: 'bg-purple-100 text-purple-700' },
  spelling: { label: 'Ortografía', color: 'bg-red-100 text-red-700' },
  vocabulary: { label: 'Vocabulario', color: 'bg-blue-100 text-blue-700' },
  preposition: { label: 'Preposición', color: 'bg-amber-100 text-amber-700' },
  conjugation: { label: 'Conjugación', color: 'bg-green-100 text-green-700' },
  expression: { label: 'Expresión', color: 'bg-teal-100 text-teal-700' },
  article: { label: 'Artículo', color: 'bg-orange-100 text-orange-700' },
};

const ERROR_CATEGORIES = [
  { id: 'accent', label: 'Acentos', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { id: 'spelling', label: 'Ortografía', color: 'bg-red-100 text-red-700 border-red-200' },
  { id: 'preposition', label: 'Preposiciones', color: 'bg-amber-100 text-amber-700 border-amber-200' },
  { id: 'article', label: 'Artículos', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { id: 'conjugation', label: 'Conjugaciones', color: 'bg-green-100 text-green-700 border-green-200' },
  { id: 'expression', label: 'Expresiones', color: 'bg-teal-100 text-teal-700 border-teal-200' },
  { id: 'vocabulary', label: 'Vocabulario', color: 'bg-blue-100 text-blue-700 border-blue-200' },
];

interface TrainingError {
  id: string;
  errorType: string;
  original: string;
  corrected: string;
  sentence: string;
  blankSentence: string;
  attempts: number;
  correctCount: number;
  successRate: number;
}

export default function ErrorTrainingPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);

  // Filter state
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [started, setStarted] = useState(false);

  // Training state
  const [allErrors, setAllErrors] = useState<TrainingError[]>([]);
  const [currentBatch, setCurrentBatch] = useState<TrainingError[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedInRound, setFailedInRound] = useState<TrainingError[]>([]);
  const [showRetryBanner, setShowRetryBanner] = useState(false);
  const [totalLearned, setTotalLearned] = useState(0);
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set());

  // Question state
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ correct: boolean; expectedAnswer: string } | null>(null);
  const [isRetyping, setIsRetyping] = useState(false);
  const [retypeAnswer, setRetypeAnswer] = useState('');

  const validateMutation = useMutation({
    mutationFn: ({ errorId, answer }: { errorId: string; answer: string }) =>
      essaysApi.validateErrorAnswer(errorId, answer),
  });

  const currentError = currentBatch[currentIndex] || null;

  const toggleCategory = (id: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleStart = async () => {
    const categories = selectedCategories.size > 0 ? Array.from(selectedCategories) : undefined;
    const errors = await essaysApi.getErrorsForTraining(languageId!, categories);
    if (errors.length === 0) return;

    setAllErrors(errors);
    const batch = errors.slice(0, BATCH_SIZE);
    setCurrentBatch(batch);
    setCurrentIndex(0);
    setFailedInRound([]);
    setStarted(true);
  };

  useEffect(() => {
    if (started && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [currentIndex, started, showRetryBanner, result]);

  // Enter to dismiss error → start retype
  useEffect(() => {
    if (!result || result.correct || isRetyping) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        setIsRetyping(true);
        setRetypeAnswer('');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [result, isRetyping]);

  // Enter to dismiss retry banner
  useEffect(() => {
    if (!showRetryBanner) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        dismissRetryBanner();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showRetryBanner]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentError || !answer.trim()) return;

    validateMutation.mutate(
      { errorId: currentError.id, answer },
      {
        onSuccess: (data) => {
          if (data.correct) {
            setResult({ correct: true, expectedAnswer: data.expectedAnswer });
            setLearnedIds((prev) => {
              const next = new Set(prev).add(currentError.id);
              setTotalLearned(next.size);
              return next;
            });
            setTimeout(() => advanceToNext(), 500);
          } else {
            setResult({ correct: false, expectedAnswer: data.expectedAnswer });
            setFailedInRound((prev) => [...prev, currentError]);
          }
        },
      }
    );
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

    if (currentIndex + 1 < currentBatch.length) {
      setCurrentIndex(currentIndex + 1);
    } else if (failedInRound.length > 0) {
      setShowRetryBanner(true);
    } else {
      loadNextBatch();
    }
  };

  const dismissRetryBanner = () => {
    setShowRetryBanner(false);
    setCurrentBatch([...failedInRound]);
    setFailedInRound([]);
    setCurrentIndex(0);
  };

  const loadNextBatch = () => {
    const remaining = allErrors.filter((e) => !learnedIds.has(e.id) && !currentBatch.some((b) => b.id === e.id));
    const next = remaining.slice(0, BATCH_SIZE);
    if (next.length === 0) return; // all done
    setCurrentBatch(next);
    setCurrentIndex(0);
    setFailedInRound([]);
  };

  const isAllDone = started && allErrors.length > 0 && totalLearned >= allErrors.length;
  const noMoreBatches = started && !currentError && !showRetryBanner && !isAllDone;

  const insertChar = (char: string) => {
    if (isRetyping) {
      setRetypeAnswer((prev) => prev + char);
    } else {
      setAnswer((prev) => prev + char);
    }
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // --- RENDERS ---

  // Selection screen
  if (!started) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8 space-y-6">
            <h2 className="text-2xl font-bold text-center">Entrenar errores de redacción</h2>
            <p className="text-center text-muted-foreground">
              Completa las frases con la palabra correcta
            </p>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Filtra por tipo (vacío = todos):</p>
              <div className="flex flex-wrap gap-2">
                {ERROR_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all ${
                      selectedCategories.has(cat.id)
                        ? cat.color + ' border-current'
                        : 'bg-muted text-muted-foreground border-transparent'
                    }`}
                  >
                    {selectedCategories.has(cat.id) && <Check className="w-3 h-3 inline mr-1" />}
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleStart} size="lg">Comenzar</Button>
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
            <h2 className="text-3xl font-bold mb-6">¡Entrenamiento completado!</h2>
            <div className="text-6xl font-bold mb-4">{totalLearned} / {allErrors.length}</div>
            <div className="text-2xl text-muted-foreground mb-8">errores practicados</div>
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
        <TrainingHeader navigate={navigate} totalLearned={totalLearned} totalErrors={allErrors.length} />
        <div className="max-w-5xl mx-auto px-6 pt-8">
          <Card>
            <CardContent className="pt-12 pb-12 text-center space-y-6">
              <div className="text-orange-500 text-5xl">&#x21bb;</div>
              <h2 className="text-2xl font-bold">Vuelve a intentarlo</h2>
              <p className="text-muted-foreground">{failedInRound.length} error{failedInRound.length !== 1 ? 'es' : ''} para repasar</p>
              <Button size="lg" onClick={dismissRetryBanner}>Continuar</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!currentError) return null;

  const catInfo = CATEGORY_LABELS[currentError.errorType] || { label: currentError.errorType, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="min-h-screen bg-background">
      <TrainingHeader navigate={navigate} totalLearned={totalLearned} totalErrors={allErrors.length} />

      {/* Batch progress */}
      <div className="max-w-5xl mx-auto px-6 mb-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <Badge variant="secondary" className={`text-xs ${catInfo.color}`}>{catInfo.label}</Badge>
          <span>{currentIndex + 1}/{currentBatch.length}</span>
        </div>
      </div>

      {/* Question */}
      <div className="max-w-5xl mx-auto px-6">
        <Card>
          <CardContent className="pt-12 pb-12">
            {!result ? (
              <>
                {/* Blank sentence */}
                <div className="mb-8">
                  <p className="text-sm text-muted-foreground mb-4">Completa la frase:</p>
                  <p className="text-2xl leading-relaxed">
                    {currentError.blankSentence.split('______').map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="inline-block border-b-2 border-primary min-w-[80px] mx-1">&nbsp;</span>
                        )}
                      </span>
                    ))}
                  </p>
                </div>

                {/* French chars */}
                <div className="flex gap-1 mb-4 flex-wrap">
                  {FRENCH_CHARS.map((char) => (
                    <Button key={char} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(char)}>
                      {char}
                    </Button>
                  ))}
                </div>

                {/* Answer input */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    ref={inputRef}
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="Escribe la respuesta"
                    autoFocus
                    className="text-lg py-6"
                  />
                  <div className="flex justify-end">
                    <Button type="submit" size="lg" disabled={!answer.trim() || validateMutation.isPending}>
                      Responder
                    </Button>
                  </div>
                </form>
              </>
            ) : (
              <>
                {result.correct ? (
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 animate-in fade-in zoom-in duration-300">¡Correcto!</div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {!isRetyping ? (
                      <>
                        <p className="text-orange-600 font-medium">¡No hay problema, todavía estás aprendiendo!</p>
                        <div className="border-2 border-orange-400 bg-orange-50 rounded-lg p-4">
                          <div className="flex items-start gap-3">
                            <X className="w-5 h-5 text-orange-600 mt-1 flex-shrink-0" />
                            <span className="text-lg">{answer}</span>
                          </div>
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
                        <p className="text-sm font-medium">Vuelve a escribir la respuesta correcta</p>
                        <div className="flex gap-1 flex-wrap">
                          {FRENCH_CHARS.map((char) => (
                            <Button key={char} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(char)}>
                              {char}
                            </Button>
                          ))}
                        </div>
                        <form onSubmit={handleRetypeSubmit} className="space-y-4">
                          <Input
                            ref={inputRef}
                            value={retypeAnswer}
                            onChange={(e) => setRetypeAnswer(e.target.value)}
                            placeholder="Escribe la respuesta"
                            autoFocus
                            required
                            className="text-lg py-6"
                          />
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

function TrainingHeader({ navigate, totalLearned, totalErrors }: { navigate: (n: number) => void; totalLearned: number; totalErrors: number }) {
  const pct = totalErrors > 0 ? (totalLearned / totalErrors) * 100 : 0;
  return (
    <>
      <div className="border-b border-border bg-background/95 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-semibold">Entrenar errores</span>
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm font-medium text-muted-foreground">{totalLearned}/{totalErrors}</span>
        </div>
      </div>
    </>
  );
}
