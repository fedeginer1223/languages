import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Calendar, Star, FastForward, ChevronDown } from 'lucide-react';
import { srsApi, topicsApi } from '../services/api';
import type { SrsWord } from '../services/api';
import { SessionSizeControl, useSessionSize } from '../components/SessionSizeControl';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '../components/ui/dialog';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ñ', 'ó', 'ù', '^'];
const BATCH_SIZE = 7;

// Normalize smart quotes / apostrophes and trailing punctuation so equivalent inputs match
function normAnswer(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[‘’‛′ʼ]/g, "'") // curly/turned/prime apostrophes → '
    .replace(/[“”‟″]/g, '"')        // curly double quotes → "
    .replace(/[.!?,;:]+$/, '');
}

type Phase = 'mc' | 'written';

const SRS_INTERVAL_DAYS: Record<number, number> = { 1: 3, 2: 7, 3: 15, 4: 30 };

type MarkMode = 'advance' | 'postpone';

// ---- Session persistence (sessionStorage) ----
const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
interface SrsSnapshot {
  v: 1;
  savedAt: number;
  allWords: SrsWord[];
  currentBatchIds: string[];
  phase: Phase;
  roundQueueIds: string[];
  currentIndex: number;
  failedIds: string[];
  learnedIds: string[];
  mcPassedIds: string[];
  todayLearned: number;
  showRetryBanner: boolean;
}
function readSnapshot(key: string): SrsSnapshot | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as SrsSnapshot;
    if (d?.v !== 1 || !Array.isArray(d.allWords) || !Array.isArray(d.learnedIds)) return null;
    if (Date.now() - d.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
    if (d.allWords.length === 0 || d.learnedIds.length >= d.allWords.length) return null;
    return d;
  } catch { return null; }
}
function clearSnapshot(key: string) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
}


function formatShortDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function MarkReviewedDialog({ open, onOpenChange, languageId, count, reviewCount, topicId, topicName, onDone }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  languageId: string;
  count: number;
  reviewCount: number;
  topicId: string | null;
  topicName?: string;
  onDone: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<MarkMode>('postpone');
  const topicIds = topicId ? [topicId] : undefined;

  const { data: preview, isFetching: previewLoading } = useQuery({
    queryKey: ['mark-reviewed-preview', languageId, mode, topicId],
    queryFn: () => srsApi.markDueReviewed(languageId, mode, { topicIds, dryRun: true }),
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const confirm = async () => {
    setSubmitting(true);
    try {
      const res = await srsApi.markDueReviewed(languageId, mode, { topicIds });
      await queryClient.invalidateQueries({ queryKey: ['srs-daily'] });
      await queryClient.invalidateQueries({ queryKey: ['due-counts', languageId] });
      onOpenChange(false);
      onDone(res.count);
    } finally {
      setSubmitting(false);
    }
  };

  const options: { value: MarkMode; title: string; desc: string }[] = [
    { value: 'advance', title: 'Las doy por sabidas', desc: 'suben un nivel; vuelven en 3/7/15/30 días según el nuevo nivel (nivel 4 superado = dominada)' },
    { value: 'postpone', title: 'Aplazar', desc: 'mantienen su nivel; vuelven cuando les toque sin contar como acierto' },
  ];
  const dates = preview ? Object.entries(preview.byDate).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Palabras atrasadas</DialogTitle>
          <DialogDescription>
            Tienes {count} palabras atrasadas (de días anteriores). Las {reviewCount - count} que vencen hoy no se tocan. Cada atrasada volverá el día que le toque según su nivel.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          {topicId ? `Solo del topic ${topicName ?? ''}` : 'De todos los topics'}
        </p>
        <div className="space-y-2" role="radiogroup">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={mode === o.value}
              onClick={() => setMode(o.value)}
              className={`w-full text-left rounded-lg border p-3 transition-all ${mode === o.value ? 'border-primary bg-primary/5' : 'border-input hover:bg-muted/40'}`}
            >
              <p className="text-sm font-medium">{o.title}</p>
              <p className="text-xs text-muted-foreground">{o.desc}</p>
            </button>
          ))}
        </div>
        <div className="text-sm min-h-[2.5rem] space-y-1">
          {previewLoading && !preview ? (
            <p className="text-muted-foreground">Calculando…</p>
          ) : preview ? (
            <>
              {dates.length > 0 && (
                <p>Caerán: {dates.map(([k, n]) => `${n} el ${formatShortDate(k)}`).join(' · ')}</p>
              )}
              {mode === 'advance' && preview.mastered > 0 && (
                <p>{preview.mastered} pasarán a dominadas</p>
              )}
              {preview.count === 0 && <p className="text-muted-foreground">No hay palabras que reprogramar.</p>}
            </>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancelar</Button>
          <Button onClick={confirm} disabled={submitting || !preview || preview.count === 0}>
            {submitting ? 'Aplicando…' : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function seenLabel(w: SrsWord): string {
  return w.daysSinceLastTrained != null ? `visto hace ${w.daysSinceLastTrained}d` : '';
}
function overdueLabel(w: SrsWord): string {
  if (!w.nextReviewAt) return '';
  const sod = new Date(); sod.setHours(0, 0, 0, 0);
  const due = new Date(w.nextReviewAt); due.setHours(0, 0, 0, 0);
  return `${Math.max(1, Math.floor((sod.getTime() - due.getTime()) / 86400000))}d`;
}
function badgeText(base: string, parts: string[]): string {
  const [first, ...rest] = parts.filter(Boolean);
  return [first ? `${base} ${first}` : base, ...rest].join(' · ');
}

export default function SrsTrainingPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const [searchParams] = useSearchParams();
  const urlTopicIds = searchParams.get('topicIds')?.split(',').filter(Boolean) || undefined;
  const errorsOnly = searchParams.get('mode') === 'errors';
  // Topic selection in the pre-start dropdown. null = all topics. URL param takes
  // precedence on first mount (used when launching from a topic page).
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    urlTopicIds && urlTopicIds.length === 1 ? urlTopicIds[0] : null
  );
  const topicIds = selectedTopicId ? [selectedTopicId] : urlTopicIds;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [markOpen, setMarkOpen] = useState(false);
  const [openWhy, setOpenWhy] = useState<'today' | 'overdue' | null>(null);
  const [showList, setShowList] = useState<'today' | 'overdue' | null>(null);
  const [doneNote, setDoneNote] = useState<number | null>(null);
  useEffect(() => {
    if (doneNote === null) return;
    const t = setTimeout(() => setDoneNote(null), 3000);
    return () => clearTimeout(t);
  }, [doneNote]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [started, setStarted] = useState(false);
  const snapshotKey = `srs-session:${languageId}:${errorsOnly ? 'errors' : 'vocab'}`;
  const [pendingSnapshot, setPendingSnapshot] = useState<SrsSnapshot | null>(() => readSnapshot(snapshotKey));
  // Session-flow state is mirrored in refs that are written synchronously by the
  // setters below, so closures invoked later (setTimeout, key handlers) always
  // read the latest values instead of the render they were created in.
  const [allWords, _setAllWords] = useState<SrsWord[]>([]);
  const [currentBatch, _setCurrentBatch] = useState<SrsWord[]>([]);
  const [phase, _setPhase] = useState<Phase>('mc');
  const [roundQueue, _setRoundQueue] = useState<SrsWord[]>([]);
  const [currentIndex, _setCurrentIndex] = useState(0);
  const [failedInRound, _setFailedInRound] = useState<SrsWord[]>([]);
  const allWordsRef = useRef<SrsWord[]>([]);
  const currentBatchRef = useRef<SrsWord[]>([]);
  const phaseRef = useRef<Phase>('mc');
  const roundQueueRef = useRef<SrsWord[]>([]);
  const currentIndexRef = useRef(0);
  const failedInRoundRef = useRef<SrsWord[]>([]);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setAllWords = (v: SrsWord[]) => { allWordsRef.current = v; _setAllWords(v); };
  const setCurrentBatch = (v: SrsWord[]) => { currentBatchRef.current = v; _setCurrentBatch(v); };
  const setPhase = (v: Phase) => { phaseRef.current = v; _setPhase(v); };
  const setRoundQueue = (v: SrsWord[]) => { roundQueueRef.current = v; _setRoundQueue(v); };
  const setCurrentIndex = (v: number) => { currentIndexRef.current = v; _setCurrentIndex(v); };
  const setFailedInRound = (v: SrsWord[]) => { failedInRoundRef.current = v; _setFailedInRound(v); };
  const [showRetryBanner, setShowRetryBanner] = useState(false);
  const [mcPassedIds, setMcPassedIds] = useState<Set<string>>(new Set());
  const learnedRef = useRef<Set<string>>(new Set());
  const [todayLearned, setTodayLearned] = useState(0);
  const [sessionSize, setSessionSize] = useSessionSize(languageId);
  const [selectionMode, setSelectionMode] = useState<'fifo' | 'lifo' | 'random'>('random');

  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ correct: boolean; expectedAnswer: string; userAnswer?: string } | null>(null);
  const [isRetyping, setIsRetyping] = useState(false);
  const [retypeAnswer, setRetypeAnswer] = useState('');
  const [multipleChoiceOptions, setMultipleChoiceOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const { data: dailySession, isLoading, refetch } = useQuery({
    queryKey: ['srs-daily', languageId, topicIds, sessionSize, selectionMode, errorsOnly],
    queryFn: () => srsApi.getDailySession(languageId!, topicIds, undefined, selectionMode, errorsOnly, sessionSize),
    enabled: !!languageId,
  });

  // Topics for the pre-start dropdown ("all topics" or a specific one).
  const { data: topics } = useQuery({
    queryKey: ['topics', languageId],
    queryFn: () => topicsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  // Global progress: in progress + mastered words (from summary)
  const globalInProgress = (dailySession?.summary.inProgress || 0);
  const globalMastered = (dailySession?.summary.mastered || 0);
  const globalTotal = (dailySession?.summary.totalInLanguage || 0);
  const globalProgress = globalInProgress + globalMastered + todayLearned;

  const currentWord = roundQueue[currentIndex] || null;

  useEffect(() => {
    if (!currentWord || phase !== 'mc' || result) return;
    setLoadingOptions(true); setMultipleChoiceOptions([]);
    srsApi.getMultipleChoiceOptions(currentWord.id).then(d => { setMultipleChoiceOptions(d.options); setLoadingOptions(false); }).catch(() => setLoadingOptions(false));
  }, [currentWord?.id, phase, result, currentIndex]);

  useEffect(() => { if (phase === 'written' && !result && inputRef.current) setTimeout(() => inputRef.current?.focus(), 50); }, [currentIndex, phase, result, showRetryBanner]);

  useEffect(() => {
    if (phase !== 'mc' || result || multipleChoiceOptions.length === 0) return;
    const h = (e: KeyboardEvent) => { const n = parseInt(e.key); if (n >= 1 && n <= multipleChoiceOptions.length) handleMCSelect(multipleChoiceOptions[n - 1]); };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [phase, result, multipleChoiceOptions, currentWord]);

  useEffect(() => {
    if (!result || result.correct || isRetyping) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); setIsRetyping(true); setRetypeAnswer(''); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [result, isRetyping]);

  useEffect(() => {
    if (!showRetryBanner) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); dismissRetryBanner(); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, [showRetryBanner]);

  const handleStart = async () => {
    if (!dailySession) return;
    const words = [...dailySession.words];
    console.log('[SRS] handleStart — words received:', words.length, 'summary:', dailySession.summary);
    console.log('[SRS] unique ids:', new Set(words.map(w => w.id)).size);
    if (words.length === 0) return;
    setAllWords(words);
    setCurrentBatch(words.slice(0, BATCH_SIZE));
    setPhase('mc'); setRoundQueue(words.slice(0, BATCH_SIZE)); setCurrentIndex(0); setStarted(true);
  };

  const handleMCSelect = useCallback((option: string) => {
    if (!currentWord) return;
    const correct = option.toLowerCase().trim() === currentWord.term.toLowerCase().trim();
    srsApi.recordAttempt(currentWord.id, correct).catch(() => {});
    if (correct) {
      setResult({ correct: true, expectedAnswer: currentWord.term });
      setMcPassedIds(prev => new Set(prev).add(currentWord.id));
      scheduleAdvance();
    } else {
      setResult({ correct: false, expectedAnswer: currentWord.term, userAnswer: option });
      setFailedInRound([...failedInRoundRef.current, currentWord]);
    }
  }, [currentWord]);

  const handleWrittenSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!currentWord) return;
    const correct = normAnswer(answer) === normAnswer(currentWord.term);
    srsApi.recordAttempt(currentWord.id, correct).catch(() => {});
    if (correct) {
      setResult({ correct: true, expectedAnswer: currentWord.term });
      learnedRef.current = new Set(learnedRef.current).add(currentWord.id);
      setTodayLearned(learnedRef.current.size);
      srsApi.advanceWord(currentWord.id).catch(() => {});
      scheduleAdvance();
    } else {
      setResult({ correct: false, expectedAnswer: currentWord.term, userAnswer: answer });
      setFailedInRound([...failedInRoundRef.current, currentWord]);
      // NO level drop on training failure — only retry until correct
      // Levels only drop from missing a training day (overdue)
    }
  };

  const handleMarkAsCorrect = () => {
    if (!currentWord) return;
    // Override: treat as correct even though app marked wrong
    setResult({ correct: true, expectedAnswer: currentWord.term });
    learnedRef.current = new Set(learnedRef.current).add(currentWord.id);
    setTodayLearned(learnedRef.current.size);
    // Remove from failed (won't be retried)
    setFailedInRound(failedInRoundRef.current.filter(w => w.id !== currentWord.id));
    // Advance SRS level
    srsApi.advanceWord(currentWord.id).catch(() => {});
    scheduleAdvance();
  };

  const handleRetypeSubmit = (e: React.FormEvent) => {
    e.preventDefault(); if (!result?.expectedAnswer) return;
    if (normAnswer(retypeAnswer) === normAnswer(result.expectedAnswer)) { setResult({ ...result, correct: true }); scheduleAdvance(); }
    else setRetypeAnswer('');
  };

  // Debounced: at most one pending advance, so a duplicate event can never skip a word.
  const scheduleAdvance = () => {
    if (advanceTimerRef.current) return;
    advanceTimerRef.current = setTimeout(() => { advanceTimerRef.current = null; advanceToNext(); }, 500);
  };

  // All flow functions read refs only (never render-captured state).
  const advanceToNext = () => {
    setResult(null); setAnswer(''); setIsRetyping(false); setRetypeAnswer('');
    const idx = currentIndexRef.current;
    if (idx + 1 < roundQueueRef.current.length) setCurrentIndex(idx + 1);
    else if (failedInRoundRef.current.length > 0) setShowRetryBanner(true);
    else finishPhase();
  };

  const dismissRetryBanner = () => {
    const failed = [...failedInRoundRef.current];
    setShowRetryBanner(false); setRoundQueue(failed); setFailedInRound([]); setCurrentIndex(0);
  };

  const finishPhase = () => {
    if (phaseRef.current === 'mc') {
      const learned = learnedRef.current;
      const needsWritten = currentBatchRef.current.filter(w => !learned.has(w.id));
      if (needsWritten.length === 0) { loadNextBatch(); return; }
      setPhase('written'); setRoundQueue(needsWritten); setCurrentIndex(0); setFailedInRound([]);
    } else loadNextBatch();
  };

  const loadNextBatch = (): boolean => {
    const learned = learnedRef.current;
    const remaining = allWordsRef.current.filter(w => !learned.has(w.id));
    const batch = remaining.slice(0, BATCH_SIZE);
    if (batch.length === 0) return false;
    setCurrentBatch(batch); setPhase('mc'); setMcPassedIds(new Set()); setRoundQueue(batch); setCurrentIndex(0); setFailedInRound([]);
    return true;
  };

  const insertChar = (char: string) => { if (isRetyping) setRetypeAnswer(prev => prev + char); else setAnswer(prev => prev + char); setTimeout(() => inputRef.current?.focus(), 0); };

  const remainingCount = allWords.filter(w => !learnedRef.current.has(w.id)).length;
  const isAllDone = started && allWords.length > 0 && todayLearned >= allWords.length && remainingCount === 0;
  const noMoreBatches = started && !currentWord && !showRetryBanner && !result && remainingCount === 0 && !isAllDone;

  // Self-healing: never sit on an empty queue while words remain unlearned.
  useEffect(() => {
    if (!started || showRetryBanner || currentWord || result) return;
    if (allWordsRef.current.some(w => !learnedRef.current.has(w.id))) loadNextBatch();
  }, [started, showRetryBanner, currentWord, result, roundQueue, currentIndex, allWords, todayLearned]);

  // Refresh sidebar badges + re-fetch daily session (so the "completed" screen
  // can show how many due words still remain today — safety net for the case
  // where the user closed a session early and left reviews unadvanced).
  useEffect(() => {
    if (!(isAllDone || noMoreBatches) || !languageId) return;
    queryClient.invalidateQueries({ queryKey: ['due-counts', languageId] });
    refetch();
  }, [isAllDone, noMoreBatches, languageId, queryClient, refetch]);

  // Persist the session so it survives remounts (Fast Refresh) and reloads.
  useEffect(() => {
    if (!started || isAllDone || noMoreBatches) return;
    const t = setTimeout(() => {
      const snap: SrsSnapshot = {
        v: 1,
        savedAt: Date.now(),
        allWords: allWordsRef.current,
        currentBatchIds: currentBatchRef.current.map(w => w.id),
        phase: phaseRef.current,
        roundQueueIds: roundQueueRef.current.map(w => w.id),
        currentIndex: currentIndexRef.current,
        failedIds: failedInRoundRef.current.map(w => w.id),
        learnedIds: [...learnedRef.current],
        mcPassedIds: [...mcPassedIds],
        todayLearned,
        showRetryBanner,
      };
      try { sessionStorage.setItem(snapshotKey, JSON.stringify(snap)); } catch { /* ignore */ }
    }, 150);
    return () => clearTimeout(t);
  }, [started, isAllDone, noMoreBatches, snapshotKey, allWords, currentBatch, phase, roundQueue, currentIndex, failedInRound, mcPassedIds, todayLearned, showRetryBanner]);

  // Session finished: drop the snapshot.
  useEffect(() => {
    if (isAllDone || noMoreBatches) clearSnapshot(snapshotKey);
  }, [isAllDone, noMoreBatches, snapshotKey]);

  const resumeSnapshot = () => {
    const d = pendingSnapshot;
    if (!d) return;
    const byId = new Map(d.allWords.map(w => [w.id, w]));
    const pick = (ids: string[]) => ids.map(id => byId.get(id)).filter((w): w is SrsWord => !!w);
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    learnedRef.current = new Set(d.learnedIds);
    setAllWords(d.allWords);
    setCurrentBatch(pick(d.currentBatchIds));
    setPhase(d.phase);
    setRoundQueue(pick(d.roundQueueIds));
    setCurrentIndex(d.currentIndex);
    setFailedInRound(pick(d.failedIds));
    setMcPassedIds(new Set(d.mcPassedIds));
    setTodayLearned(d.todayLearned);
    setShowRetryBanner(d.showRetryBanner);
    setResult(null); setAnswer(''); setIsRetyping(false); setRetypeAnswer('');
    setPendingSnapshot(null);
    setStarted(true);
  };

  const discardSnapshot = () => { clearSnapshot(snapshotKey); setPendingSnapshot(null); };

  /** Reset all session state and start a fresh round with whatever due words
   *  remain according to the latest fetched session. Used from the finished
   *  screen when the user wants to close out today's queue without going back
   *  to the pre-start. */
  const continueWithRemaining = () => {
    if (!dailySession || dailySession.words.length === 0) return;
    const words = [...dailySession.words];
    learnedRef.current = new Set();
    setTodayLearned(0);
    setAllWords(words);
    setCurrentBatch(words.slice(0, BATCH_SIZE));
    setPhase('mc');
    setRoundQueue(words.slice(0, BATCH_SIZE));
    setCurrentIndex(0);
    setFailedInRound([]);
    setShowRetryBanner(false);
    if (advanceTimerRef.current) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null; }
    setResult(null);
    setAnswer('');
    setIsRetyping(false);
    setRetypeAnswer('');
    setMcPassedIds(new Set());
  };

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Cargando...</div></div>;

  // Pre-start
  if (!started) {
    const s = dailySession?.summary;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-bold">{errorsOnly ? 'Repaso de errores' : 'Repaso diario'}</h2>
            </div>
            {pendingSnapshot && (
              <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-primary/30 bg-primary/5 text-sm">
                <span>Tienes una sesión a medias ({pendingSnapshot.learnedIds.length}/{pendingSnapshot.allWords.length}).</span>
                <span className="flex gap-2">
                  <Button size="sm" onClick={resumeSnapshot}>Reanudar</Button>
                  <Button size="sm" variant="outline" onClick={discardSnapshot}>Descartar</Button>
                </span>
              </div>
            )}
            {s && (<>
              {!errorsOnly && (
                <p className="text-center text-xs uppercase tracking-wide text-muted-foreground">Hoy: {s.todayCount} repasos + {s.newCount} nuevas</p>
              )}
              {errorsOnly ? (
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-amber-50 rounded-lg text-center"><p className="text-3xl font-bold text-amber-600">{s.reviewCount}</p><p className="text-sm text-muted-foreground">Recordar</p></div>
                  <div className="p-4 bg-blue-50 rounded-lg text-center"><p className="text-3xl font-bold text-blue-600">{s.newCount}</p><p className="text-sm text-muted-foreground">Nuevas</p></div>
                  <div className="p-4 bg-green-50 rounded-lg text-center"><p className="text-3xl font-bold text-green-600">{s.mastered}</p><p className="text-sm text-muted-foreground">Dominadas</p></div>
                </div>
              ) : (<>
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-amber-50 rounded-lg text-center"><p className="text-3xl font-bold text-amber-600">{s.todayCount}</p><p className="text-sm font-medium">Para hoy</p><p className="text-xs text-muted-foreground">vencen hoy</p></div>
                  <div className={`p-4 rounded-lg text-center ${s.overdueCount > 0 ? 'bg-orange-50' : 'bg-muted/40'}`}>
                    <p className={`text-3xl font-bold ${s.overdueCount > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>{s.overdueCount}</p>
                    <p className="text-sm font-medium">Atrasadas</p>
                    <p className="text-xs text-muted-foreground">{s.overdueCount > 0 ? 'de días anteriores' : 'ninguna'}</p>
                    {s.overdueCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setMarkOpen(true)}
                        className="mt-1.5 inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-4 hover:underline hover:text-foreground"
                      >
                        <FastForward className="w-3 h-3" />
                        Dar por repasadas…
                      </button>
                    )}
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg text-center"><p className="text-3xl font-bold text-blue-600">{s.newCount}</p><p className="text-sm font-medium">Nuevas</p><p className="text-xs text-muted-foreground">las eliges con el slider</p></div>
                </div>
                {([
                  { key: 'today' as const, count: s.todayCount, title: `¿Por qué estas ${s.todayCount}?`, byLevel: s.todayByLevel, label: 'recordar' },
                  { key: 'overdue' as const, count: s.overdueCount, title: `¿Por qué las ${s.overdueCount} atrasadas?`, byLevel: s.overdueByLevel, label: 'atrasada' },
                ]).filter((g) => g.count > 0).map((g) => {
                  const open = openWhy === g.key;
                  const list = (dailySession?.words ?? []).filter((w) => w.label === g.label);
                  return (
                    <div key={g.key} className="text-sm">
                      <button
                        type="button"
                        onClick={() => setOpenWhy(open ? null : g.key)}
                        className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                        {g.title}
                      </button>
                      {open && (
                        <div className="mt-2 pl-5 space-y-1 text-muted-foreground">
                          {Object.entries(g.byLevel ?? {}).sort(([x], [y]) => Number(x) - Number(y)).map(([lvl, n]) => (
                            <p key={lvl}>{n} de nivel {lvl} — acertadas hace {SRS_INTERVAL_DAYS[Number(lvl)] ?? '?'} días</p>
                          ))}
                          <button
                            type="button"
                            onClick={() => setShowList(showList === g.key ? null : g.key)}
                            className="text-xs underline underline-offset-4 hover:text-foreground"
                          >
                            {showList === g.key ? 'Ocultar lista' : 'Ver lista'}
                          </button>
                          {showList === g.key && (
                            <div className="max-h-56 overflow-y-auto divide-y rounded border bg-muted/20">
                              {list.map((w) => (
                                <div key={w.id} className="flex items-baseline gap-2 px-2 py-1 text-xs">
                                  <span className="font-serif font-medium text-sm text-foreground">{w.term}</span>
                                  <span>· nivel {w.srsLevel}</span>
                                  <span>· último acierto hace {w.daysSinceLastTrained ?? '?'} d</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>)}
              {s.forgottenCount > 0 && <div className="p-3 bg-red-50 border border-red-200 rounded-lg"><p className="text-sm text-red-700">{s.forgottenCount} olvidada{s.forgottenCount !== 1 ? 's' : ''} (vuelven a ser nuevas)</p></div>}
              <p className="text-center text-xs text-muted-foreground">{s.inProgress} en curso · {s.mastered} dominadas · {s.pending} por introducir · {s.totalInLanguage} en total</p>

              {/* Topic filter */}
              {!errorsOnly && (topics?.length ?? 0) > 0 && (
                <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium whitespace-nowrap">Topic</p>
                    <select
                      value={selectedTopicId ?? ''}
                      onChange={(e) => setSelectedTopicId(e.target.value || null)}
                      className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                    >
                      <option value="">Todos los topics</option>
                      {(topics ?? []).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Session size */}
              <SessionSizeControl value={sessionSize} onChange={setSessionSize} summary={s} />

              {/* Selection mode */}
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Orden:</p>
                {(['fifo', 'lifo', 'random'] as const).map(mode => (
                  <button key={mode} onClick={() => setSelectionMode(mode)}
                    className={`text-xs px-3 py-1 rounded-full border transition-all ${selectionMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-transparent'}`}>
                    {mode === 'fifo' ? 'Antiguas primero' : mode === 'lifo' ? 'Recientes primero' : 'Azar'}
                  </button>
                ))}
              </div>
            </>)}
            <div className="flex gap-3 justify-center pt-2">
              <Button onClick={handleStart} size="lg" disabled={!s || s.totalCount === 0}>
                {!s || s.totalCount === 0 ? 'No hay palabras para hoy' : `Comenzar (${s.totalCount})`}
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate(-1)}>Volver</Button>
            </div>
            {doneNote !== null && (
              <p className="text-center text-sm text-green-600">Hecho: {doneNote} palabras reprogramadas</p>
            )}
            {!errorsOnly && s && languageId && (
              <MarkReviewedDialog
                open={markOpen}
                onOpenChange={setMarkOpen}
                languageId={languageId}
                count={s.overdueCount}
                reviewCount={s.reviewCount}
                topicId={selectedTopicId}
                topicName={topics?.find((t) => t.id === selectedTopicId)?.name}
                onDone={setDoneNote}
              />
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Finished
  if (isAllDone || noMoreBatches) {
    const stillDue = dailySession?.summary.reviewCount ?? 0;
    const tomorrowCount = dailySession?.summary.tomorrowCount;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full"><CardContent className="pt-12 pb-12 text-center">
          <Star className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-3xl font-bold mb-4">¡Repaso completado!</h2>
          <p className="text-xl text-muted-foreground mb-4">{todayLearned} palabras repasadas hoy</p>
          {tomorrowCount !== undefined && (
            <p className="text-sm text-muted-foreground mb-4">Mañana te esperan {tomorrowCount} repasos</p>
          )}
          {stillDue > 0 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-left">
              <p className="text-sm text-amber-900 font-medium">
                Aún hay {stillDue} palabra{stillDue !== 1 ? 's' : ''} de repaso pendiente{stillDue !== 1 ? 's' : ''} para hoy.
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Termina el día en 0 pendientes para que el SRS avance correctamente.
              </p>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            {stillDue > 0 && (
              <Button size="lg" onClick={continueWithRemaining}>
                Continuar ({stillDue})
              </Button>
            )}
            <Button variant={stillDue > 0 ? 'outline' : 'default'} size="lg" onClick={() => { clearSnapshot(snapshotKey); navigate(-1); }}>
              Volver
            </Button>
          </div>
        </CardContent></Card>
      </div>
    );
  }

  // Retry
  if (showRetryBanner) {
    return (
      <div className="min-h-screen bg-background">
        <SrsHeader navigate={navigate} totalLearned={globalProgress} totalWords={globalTotal} />
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
      <SrsHeader navigate={navigate} totalLearned={globalProgress} totalWords={globalTotal} />
      <div className="max-w-5xl mx-auto px-6 mb-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>{phase === 'mc' ? 'Opción múltiple' : 'Escrita'}</span>
            {currentWord.label === 'nueva' && <Badge className="bg-blue-100 text-blue-700 text-xs">Nueva</Badge>}
            {currentWord.label === 'recordar' && <Badge className="bg-amber-100 text-amber-700 text-xs">{['Recordar', seenLabel(currentWord)].filter(Boolean).join(' · ')}</Badge>}
            {currentWord.label === 'atrasada' && <Badge className="bg-red-100 text-red-700 text-xs">{badgeText('Atrasada', [overdueLabel(currentWord), seenLabel(currentWord)])}</Badge>}
          </div>
          <span>{currentIndex + 1}/{roundQueue.length}</span>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6">
        <Card><CardContent className="pt-12 pb-12">
          {!result ? (<>
            <div className="mb-8">
              {errorsOnly && currentWord.blankSentence ? (
                <>
                  <span className="text-sm text-muted-foreground">Completa la frase</span>
                  <p className="text-2xl leading-relaxed mt-2 mb-2">
                    {currentWord.blankSentence.split('______').map((part, i, arr) => (
                      <span key={i}>
                        {part}
                        {i < arr.length - 1 && (
                          <span className="inline-block border-b-2 border-primary min-w-[80px] mx-1">&nbsp;</span>
                        )}
                      </span>
                    ))}
                  </p>
                  {currentWord.definition && currentWord.definition !== `Forma correcta de "${currentWord.term}"` && (
                    <p className="text-sm text-muted-foreground italic">{currentWord.definition}</p>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-muted-foreground">Definición</span>
                  <div className="text-3xl font-medium mt-2 mb-8">{currentWord.definition}</div>
                </>
              )}
            </div>
            {phase === 'mc' ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Selecciona una respuesta</p>
                {loadingOptions ? <div className="text-center py-8 text-muted-foreground">Cargando...</div> : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {multipleChoiceOptions.map((opt, i) => (
                      <Button key={i} type="button" variant="outline" className="h-auto py-4 px-6 text-left justify-start text-lg" onClick={() => handleMCSelect(opt)}>
                        <span className="flex items-center gap-3 w-full">
                          <span className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-sm font-medium">{i + 1}</span>
                          <span className="flex-1">{opt}</span>
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
                  {FRENCH_CHARS.map(c => <Button key={c} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(c)}>{c}</Button>)}
                </div>
                <Input ref={inputRef} value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Escribe la respuesta" autoFocus className="text-lg py-6" />
                <div className="flex justify-end"><Button type="submit" size="lg">Responder</Button></div>
              </form>
            )}
          </>) : (<>
            {result.correct ? (
              <div className="text-center"><div className="text-3xl font-bold text-green-600">¡Correcto!</div></div>
            ) : (
              <div className="space-y-6">
                {!isRetyping ? (<>
                  <div className="flex items-center justify-between">
                    <p className="text-orange-600 font-medium">¡No hay problema!</p>
                    <Button variant="link" className="text-primary" onClick={handleMarkAsCorrect}>Acerté</Button>
                  </div>
                  {result.userAnswer && <div className="border-2 border-orange-400 bg-orange-50 rounded-lg p-4"><X className="w-5 h-5 text-orange-600 inline mr-2" /><span className="text-lg">{result.userAnswer}</span></div>}
                  <div><p className="text-sm font-medium mb-2">Respuesta correcta</p><div className="border-2 border-green-600 border-dashed bg-green-50 rounded-lg p-4"><span className="text-lg font-medium">{result.expectedAnswer}</span></div></div>
                  <p className="text-sm text-muted-foreground">Pulsa Enter para volver a escribirla</p>
                </>) : (<>
                  <div><p className="text-sm font-medium mb-2">Respuesta correcta</p><div className="border-2 border-green-600 border-dashed bg-green-50 rounded-lg p-4"><span className="text-lg font-medium">{result.expectedAnswer}</span></div></div>
                  <p className="text-sm font-medium">Vuelve a escribirla</p>
                  <div className="flex gap-1 flex-wrap">{FRENCH_CHARS.map(c => <Button key={c} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(c)}>{c}</Button>)}</div>
                  <form onSubmit={handleRetypeSubmit} className="space-y-4">
                    <Input ref={inputRef} value={retypeAnswer} onChange={e => setRetypeAnswer(e.target.value)} placeholder="Escribe" autoFocus required className="text-lg py-6" />
                    <Button type="submit" size="lg" className="w-full">Comprobar</Button>
                  </form>
                </>)}
              </div>
            )}
          </>)}
        </CardContent></Card>
      </div>
    </div>
  );
}

function SrsHeader({ navigate, totalLearned, totalWords }: { navigate: (n: number) => void; totalLearned: number; totalWords: number }) {
  const pct = totalWords > 0 ? (totalLearned / totalWords) * 100 : 0;
  return (<>
    <div className="border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><Calendar className="w-5 h-5 text-primary" /><span className="text-lg font-semibold">Entrenamiento</span></div>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><X className="w-5 h-5" /></Button>
      </div>
    </div>
    <div className="max-w-5xl mx-auto px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
        <span className="text-sm font-medium text-muted-foreground">{totalLearned}/{totalWords}</span>
      </div>
    </div>
  </>);
}
