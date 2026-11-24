import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, Loader2, ChevronRight, TimerReset, XCircle, RotateCcw } from 'lucide-react';
import { SessionSizeControl, useSessionSize } from '../components/SessionSizeControl';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import type { JudgeExampleResult } from '../types';
import { structuresApi, type StructureSessionItem, type StructureExample } from '../services/api';

type Phase = 'pre' | 'input' | 'judging' | 'result-correct' | 'retype' | 'retry-banner' | 'done';

/** Loose match matching vocab semantics: case-insensitive, accents kept, curly quotes
 * normalized, trailing punctuation stripped, whitespace collapsed. */
function normalizeForMatch(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[’‛′ʼ]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[.,!?;:"]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCorrect(userAnswer: string, reference: string): boolean {
  return normalizeForMatch(userAnswer) === normalizeForMatch(reference);
}

type DiffPart = { text: string; kind: 'same' | 'add' | 'del' };

/** Word-level diff (LCS over whitespace-split tokens). Returns parts for `a` (deletions) and `b` (additions) separately. */
function diffWords(a: string, b: string): { aParts: DiffPart[]; bParts: DiffPart[] } {
  const A = a.split(/\s+/).filter(Boolean);
  const B = b.split(/\s+/).filter(Boolean);
  const key = (w: string) => normalizeForMatch(w);
  const dp: number[][] = Array.from({ length: A.length + 1 }, () => new Array(B.length + 1).fill(0));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      dp[i][j] = key(A[i]) === key(B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const aParts: DiffPart[] = [];
  const bParts: DiffPart[] = [];
  let i = 0, j = 0;
  while (i < A.length && j < B.length) {
    if (key(A[i]) === key(B[j])) {
      aParts.push({ text: A[i], kind: 'same' });
      bParts.push({ text: B[j], kind: 'same' });
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      aParts.push({ text: A[i++], kind: 'del' });
    } else {
      bParts.push({ text: B[j++], kind: 'add' });
    }
  }
  while (i < A.length) aParts.push({ text: A[i++], kind: 'del' });
  while (j < B.length) bParts.push({ text: B[j++], kind: 'add' });
  return { aParts, bParts };
}

function DiffLine({ parts, mode }: { parts: DiffPart[]; mode: 'del' | 'add' }) {
  return (
    <>
      {parts.map((p, k) => (
        <span
          key={k}
          className={
            p.kind === 'same' ? '' : mode === 'add' ? 'font-medium text-green-700' : 'line-through text-red-600'
          }
        >
          {p.text}{' '}
        </span>
      ))}
    </>
  );
}

function pickLeastMasteredExample(structure: StructureSessionItem): StructureExample | null {
  const usable = structure.examples.filter((e) => (e.spanish ?? '').trim().length > 0);
  if (usable.length === 0) return null;
  const minCorrect = Math.min(...usable.map((e) => e.correctCount));
  const candidates = usable.filter((e) => e.correctCount === minCorrect);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export default function StructureSrsTrainingPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Pre-start config
  const [started, setStarted] = useState(false);
  const [sessionSize, setSessionSize] = useSessionSize(languageId);
  const [selectionMode, setSelectionMode] = useState<'fifo' | 'lifo' | 'random'>('random');

  // Session state
  const [phase, setPhase] = useState<Phase>('pre');
  // Bumped to Date.now() on every "Comenzar". Included in the react-query key so
  // each session forces a fresh fetch — using a counter starting at 0 wasn't
  // enough because a component remount reset it, colliding with the previous
  // session's cached key and returning stale shuffled data.
  const [sessionId, setSessionId] = useState(0);
  const [items, setItems] = useState<StructureSessionItem[]>([]);
  const [structureIdx, setStructureIdx] = useState(0);
  // Structures that user failed this round. When items are exhausted, this
  // becomes the next round's items (vocab-style retry loop).
  const [retryQueue, setRetryQueue] = useState<StructureSessionItem[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  // Structures whose SRS side-effect (advance or reschedule) has already been
  // committed this session. Used to gate SRS calls to first-appearance only.
  const seenIdsRef = useRef<Set<string>>(new Set());

  const [currentExample, setCurrentExample] = useState<StructureExample | null>(null);

  // Per-answer state
  const [answer, setAnswer] = useState('');
  const [retypeAnswer, setRetypeAnswer] = useState('');
  const [lastWrong, setLastWrong] = useState<string>('');
  const [judgeResult, setJudgeResult] = useState<JudgeExampleResult | null>(null);
  const [noAiNote, setNoAiNote] = useState(false);
  const shownAtRef = useRef<number>(Date.now());

  // Summary counters
  const [completedStructures, setCompletedStructures] = useState(0);
  const [advancedStructures, setAdvancedStructures] = useState(0);
  const [correctExamples, setCorrectExamples] = useState(0);
  const [wrongExamples, setWrongExamples] = useState(0);
  const [almostExamples, setAlmostExamples] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const retypeInputRef = useRef<HTMLInputElement | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['structure-daily', languageId, sessionSize, selectionMode, started, sessionId],
    queryFn: () => structuresApi.getDaily(languageId!, undefined, selectionMode, sessionSize),
    enabled: started && !!languageId,
    refetchOnWindowFocus: false,
  });

  // Preview of the next session (pre-start composition line and finished-screen counters).
  const { data: preview } = useQuery({
    queryKey: ['structure-daily-preview', languageId, sessionSize, selectionMode],
    queryFn: () => structuresApi.getDaily(languageId!, undefined, selectionMode, sessionSize),
    enabled: (!started || phase === 'done') && !!languageId,
    refetchOnWindowFocus: false,
  });

  const currentStructure = items[structureIdx];

  // Bootstrap items when session starts
  useEffect(() => {
    if (data && started && items.length === 0) {
      const usable = data.structures.filter((s) => s.examples.some((e) => (e.spanish ?? '').trim().length > 0));
      setItems(usable);
      setPhase(usable.length > 0 ? 'input' : 'done');
    }
  }, [data, started, items.length]);

  // Pick example whenever we land on a new structure (or the same structure in a new round)
  useEffect(() => {
    if (!currentStructure) return;
    setCurrentExample(pickLeastMasteredExample(currentStructure));
    setAnswer('');
    setRetypeAnswer('');
    setLastWrong('');
    setJudgeResult(null);
    setNoAiNote(false);
    shownAtRef.current = Date.now();
    setPhase('input');
  }, [currentStructure?.id, roundNumber]);

  // Focus management
  useEffect(() => {
    if (phase === 'input') setTimeout(() => inputRef.current?.focus(), 40);
    if (phase === 'retype') setTimeout(() => retypeInputRef.current?.focus(), 40);
  }, [phase, currentExample?.id]);

  // Refresh sidebar badges when the session ends.
  useEffect(() => {
    if (phase !== 'done' || !languageId) return;
    queryClient.invalidateQueries({ queryKey: ['due-counts', languageId] });
    queryClient.invalidateQueries({ queryKey: ['structures', languageId] });
    queryClient.invalidateQueries({ queryKey: ['structure-daily-preview'] });
  }, [phase, languageId, queryClient]);

  /** Advance to next structure in the current round, or transition to the retry
   * round if the current round is exhausted, or finish the session. */
  const goToNextStructure = useCallback(() => {
    const nextIdx = structureIdx + 1;
    if (nextIdx < items.length) {
      setStructureIdx(nextIdx);
      return;
    }
    // Round exhausted. If we have failed structures, kick off a retry round.
    if (retryQueue.length > 0) {
      // Show a between-rounds banner briefly, then swap in the retry queue.
      setPhase('retry-banner');
      return;
    }
    setPhase('done');
  }, [structureIdx, items.length, retryQueue.length]);

  const beginRetryRound = useCallback(() => {
    setItems(retryQueue);
    setRetryQueue([]);
    setStructureIdx(0);
    setRoundNumber((r) => r + 1);
    // useEffect on currentStructure.id / roundNumber will reset per-item state and phase.
  }, [retryQueue]);

  const submitAnswer = useCallback(async () => {
    if (!currentExample || !currentStructure) return;
    const trimmed = answer.trim();
    const isFirstTime = !seenIdsRef.current.has(currentStructure.id);

    // Empty == wrong (matches vocab)
    if (!trimmed) {
      setWrongExamples((c) => c + 1);
      setLastWrong('');
      setJudgeResult(null);
      setNoAiNote(false);
      structuresApi.recordExampleAttempt(currentExample.id, false).catch(() => undefined);
      setPhase('retype');
      return;
    }

    setPhase('judging');
    let result: JudgeExampleResult;
    let noAi = false;
    try {
      result = await structuresApi.judgeExample(currentExample.id, trimmed, Date.now() - shownAtRef.current);
      noAi = result.source === 'fallback';
    } catch {
      noAi = true;
      result = isCorrect(trimmed, currentExample.text)
        ? { verdict: 'valid', explanation: '', source: 'fallback' }
        : { verdict: 'invalid', explanation: '', source: 'fallback' };
    }
    setJudgeResult(result);
    setNoAiNote(noAi);

    if (result.verdict === 'valid' || result.verdict === 'almost') {
      if (result.verdict === 'almost') setAlmostExamples((c) => c + 1);
      setCorrectExamples((c) => c + 1);
      structuresApi.recordExampleAttempt(currentExample.id, true).catch(() => undefined);
      if (isFirstTime) {
        seenIdsRef.current.add(currentStructure.id);
        setCompletedStructures((c) => c + 1);
        setAdvancedStructures((c) => c + 1);
        structuresApi.advanceSrs(currentStructure.id).catch(() => undefined);
      }
      setPhase('result-correct');
    } else {
      setWrongExamples((c) => c + 1);
      setLastWrong(trimmed);
      structuresApi.recordExampleAttempt(currentExample.id, false).catch(() => undefined);
      setPhase('retype');
    }
  }, [answer, currentExample, currentStructure]);

  const submitRetype = useCallback(() => {
    if (!currentExample || !currentStructure) return;
    if (!isCorrect(retypeAnswer, currentExample.text)) {
      // Wrong retype: clear and let them try again.
      setRetypeAnswer('');
      setTimeout(() => retypeInputRef.current?.focus(), 30);
      return;
    }
    // Retype matches — the user has re-produced the reference. Vocab semantics:
    //  - The structure counts as MISSED (no SRS advance).
    //  - Only reschedule (same level) on FIRST appearance of the structure.
    //  - Push the structure into the retry queue so it comes back next round.
    //  - Move on to the next structure immediately.
    const isFirstTime = !seenIdsRef.current.has(currentStructure.id);
    if (isFirstTime) {
      seenIdsRef.current.add(currentStructure.id);
      setCompletedStructures((c) => c + 1);
      if (currentStructure.srsLevel > 0 && currentStructure.srsLevel < 6) {
        structuresApi.reschedule(currentStructure.id).catch(() => undefined);
      }
    }
    setRetryQueue((q) => [...q, currentStructure]);
    goToNextStructure();
  }, [retypeAnswer, currentExample, currentStructure, goToNextStructure]);

  const markAsCorrectOverride = useCallback(() => {
    if (!currentExample || !currentStructure) return;
    // The user asserts their answer was equivalent → count as correct.
    // Never adds to the retry queue; SRS advances as if it was clean.
    structuresApi.recordExampleAttempt(currentExample.id, true).catch(() => undefined);
    setCorrectExamples((c) => c + 1);
    setWrongExamples((c) => Math.max(0, c - 1));
    const isFirstTime = !seenIdsRef.current.has(currentStructure.id);
    if (isFirstTime) {
      seenIdsRef.current.add(currentStructure.id);
      setCompletedStructures((c) => c + 1);
      setAdvancedStructures((c) => c + 1);
      structuresApi.advanceSrs(currentStructure.id).catch(() => undefined);
    }
    goToNextStructure();
  }, [currentExample, currentStructure, goToNextStructure]);

  // Keyboard: Enter advances from result-correct or retry-banner
  useEffect(() => {
    if (phase !== 'result-correct' && phase !== 'retry-banner') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (phase === 'result-correct') goToNextStructure();
      else if (phase === 'retry-banner') beginRetryRound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, goToNextStructure, beginRetryRound]);

  const progressPct = useMemo(() => {
    if (items.length === 0) return 0;
    return Math.min(100, (structureIdx / items.length) * 100);
  }, [items.length, structureIdx]);

  // ============ Render ============

  if (!started) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/languages/${languageId}/structures`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Entrenamiento de estructuras</h1>
            <p className="text-muted-foreground mt-1">Traduce del español al idioma objetivo. Los fallos vuelven al final en una ronda de reintentos.</p>
          </div>
        </div>
        <PreStart
          sessionSize={sessionSize}
          setSessionSize={setSessionSize}
          summary={preview?.summary}
          selectionMode={selectionMode}
          setSelectionMode={setSelectionMode}
          onStart={() => { setSessionId(Date.now()); setStarted(true); }}
        />
      </div>
    );
  }

  if (isLoading || (items.length === 0 && phase !== 'done')) {
    return <FullCenter><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></FullCenter>;
  }

  if (phase === 'done') {
    const ps = preview?.summary;
    const stillDue = ps?.reviewCount ?? 0;
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold">¡Sesión completada!</h2>
            <div className="text-muted-foreground space-y-1">
              <p>{completedStructures} estructura{completedStructures === 1 ? '' : 's'} entrenada{completedStructures === 1 ? '' : 's'}</p>
              <p>{advancedStructures} subi{advancedStructures === 1 ? 'ó' : 'eron'} de nivel SRS</p>
              <p>
                <span className="text-green-700 font-medium">{correctExamples} aciertos</span>
                {' · '}
                <span className="text-red-700 font-medium">{wrongExamples} fallos</span>
              </p>
              <p>{correctExamples - almostExamples} válidas · {almostExamples} casi · {wrongExamples} inválidas</p>
              {stillDue > 0 && <p>Aún quedan {stillDue} {stillDue === 1 ? 'repaso' : 'repasos'} para hoy</p>}
              {ps?.tomorrowCount !== undefined && <p>Mañana te esperan {ps.tomorrowCount} repasos</p>}
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate(`/languages/${languageId}/structures`)}>Volver</Button>
              <Button onClick={() => {
                setStarted(false); setItems([]); setStructureIdx(0);
                setRetryQueue([]); setRoundNumber(1);
                seenIdsRef.current = new Set();
                setCurrentExample(null);
                setCompletedStructures(0); setAdvancedStructures(0);
                setCorrectExamples(0); setWrongExamples(0); setAlmostExamples(0);
                setPhase('pre');
              }}>
                <TimerReset className="w-4 h-4 mr-1" /> Otra sesión
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/languages/${languageId}/structures`)}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Salir
        </Button>
        <div className="text-sm text-muted-foreground flex items-center gap-3">
          <span>Estructura {Math.min(structureIdx + 1, items.length)} / {items.length}</span>
          {roundNumber > 1 && (
            <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
              Ronda {roundNumber} · reintento
            </span>
          )}
          {retryQueue.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs bg-red-100 text-red-900 px-2 py-0.5 rounded-full">
              {retryQueue.length} para reintentar
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-muted mb-6 overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      {currentStructure && phase !== 'retry-banner' && (
        <div className="mb-4 flex items-center gap-2">
          <Badge variant="secondary">{currentStructure.category}</Badge>
          <span className="font-mono text-sm text-muted-foreground truncate">{currentStructure.pattern}</span>
        </div>
      )}

      {phase === 'input' && currentExample && (
        <Card className="border-2">
          <CardContent className="pt-6 pb-6 space-y-5">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Traduce al idioma objetivo</div>
              <div className="text-2xl leading-snug">{currentExample.spanish}</div>
              {currentExample.correctCount >= 2 && (
                <div className="mt-2 text-xs text-green-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Dominado ({currentExample.correctCount}/2)
                </div>
              )}
            </div>

            <form onSubmit={(e) => { e.preventDefault(); submitAnswer(); }} className="space-y-3">
              <Input
                ref={inputRef}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Tu traducción…"
                className="text-lg h-12"
                autoFocus
              />
              <Button type="submit" className="w-full">Comprobar</Button>
            </form>
            <p className="text-xs text-muted-foreground text-center">
              Enter para comprobar. Dejarlo vacío cuenta como fallo. Los fallos vuelven en la ronda de reintentos.
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'judging' && currentExample && (
        <Card className="border-2">
          <CardContent className="pt-6 pb-6 space-y-5">
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Traduce al idioma objetivo</div>
              <div className="text-2xl leading-snug">{currentExample.spanish}</div>
            </div>
            <Input value={answer} disabled readOnly className="text-lg h-12" />
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Evaluando…
            </p>
          </CardContent>
        </Card>
      )}

      {phase === 'result-correct' && currentExample && (
        <Card className={`border-2 ${judgeResult?.verdict === 'almost' ? 'border-amber-300' : 'border-green-300'}`}>
          <CardContent className="pt-6 pb-6 space-y-4">
            {(() => {
              const almost = judgeResult?.verdict === 'almost';
              const corrected = judgeResult?.corrected;
              const differsFromRef = normalizeForMatch(answer) !== normalizeForMatch(currentExample.text);
              const diff = almost && corrected ? diffWords(answer.trim(), corrected) : null;
              return (
                <>
                  <div className={`flex items-center gap-2 ${almost ? 'text-amber-600' : 'text-green-600'}`}>
                    <CheckCircle2 className="w-6 h-6" />
                    <span className="text-lg font-semibold">{almost ? 'Casi' : 'Correcto'}</span>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Prompt</div>
                    <div className="text-base">{currentExample.spanish}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Tu respuesta</div>
                    <div className={`text-lg font-medium ${almost ? 'text-amber-900' : 'text-green-800'}`}>
                      {diff ? <DiffLine parts={diff.aParts} mode="del" /> : answer}
                    </div>
                  </div>
                  {almost && (
                    <div className="rounded-md bg-amber-50 border border-amber-200 p-3 space-y-2">
                      {corrected && diff && (
                        <div>
                          <div className="text-xs uppercase text-amber-900 font-semibold tracking-wider mb-0.5">Corrección</div>
                          <div className="text-lg font-medium text-amber-900"><DiffLine parts={diff.bParts} mode="add" /></div>
                        </div>
                      )}
                      {judgeResult?.explanation && <p className="text-sm text-amber-900">{judgeResult.explanation}</p>}
                    </div>
                  )}
                  {differsFromRef && (
                    <div className="rounded-md bg-green-50 border border-green-200 p-3">
                      <div className="text-xs uppercase text-green-800 font-semibold tracking-wider mb-0.5">Otra forma de decirlo</div>
                      <div className="text-base font-medium text-green-900">{currentExample.text}</div>
                    </div>
                  )}
                  {noAiNote && <p className="text-xs text-muted-foreground">Sin IA: comparado con la referencia</p>}
                </>
              );
            })()}
            <Button onClick={goToNextStructure} className="w-full" size="lg">
              Continuar <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
            <p className="text-xs text-muted-foreground text-center">Enter para continuar</p>
          </CardContent>
        </Card>
      )}

      {phase === 'retype' && currentExample && (
        <Card className="border-2 border-red-300">
          <CardContent className="pt-6 pb-6 space-y-4">
            <div className="flex items-center gap-2 text-red-600">
              <XCircle className="w-6 h-6" />
              <span className="text-lg font-semibold">Incorrecto — cópiala para memorizarla</span>
            </div>

            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wider mb-1">Prompt</div>
              <div className="text-base">{currentExample.spanish}</div>
            </div>

            {lastWrong ? (
              <div className="rounded-md bg-red-50 border border-red-200 p-3">
                <div className="text-xs uppercase text-red-800 font-semibold tracking-wider mb-0.5">Lo que escribiste</div>
                <div className="text-base italic text-red-900 line-through">"{lastWrong}"</div>
              </div>
            ) : (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                Sin respuesta — cuenta como fallo.
              </div>
            )}

            {judgeResult?.explanation && (
              <p className="text-sm text-muted-foreground">{judgeResult.explanation}</p>
            )}
            {judgeResult?.corrected && (
              <div className="rounded-md bg-green-50 border border-green-200 p-3">
                <div className="text-xs uppercase text-green-800 font-semibold tracking-wider mb-0.5">Tu frase corregida</div>
                <div className="text-base font-medium text-green-900">{judgeResult.corrected}</div>
              </div>
            )}
            {noAiNote && <p className="text-xs text-muted-foreground">Sin IA: comparado con la referencia</p>}

            <div className="rounded-md bg-amber-50 border border-amber-200 p-3">
              <div className="text-xs uppercase text-amber-900 font-semibold tracking-wider mb-1">Referencia</div>
              <div className="text-lg font-medium text-amber-900">{currentExample.text}</div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); submitRetype(); }} className="space-y-3">
              <Input
                ref={retypeInputRef}
                value={retypeAnswer}
                onChange={(e) => setRetypeAnswer(e.target.value)}
                placeholder="Cópiala exactamente…"
                className="text-lg h-12"
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={!retypeAnswer.trim()}>
                <RotateCcw className="w-4 h-4 mr-1" /> Continuar
              </Button>
            </form>

            <div className="border-t pt-3 flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={markAsCorrectOverride}
                className="text-muted-foreground hover:text-foreground"
              >
                Marcar como correcta (era equivalente)
              </Button>
              <p className="text-xs text-muted-foreground">
                Si tu respuesta era una traducción válida distinta a la referencia.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {phase === 'retry-banner' && (
        <Card className="border-2 border-amber-300">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <RotateCcw className="w-12 h-12 text-amber-600 mx-auto" />
            <h2 className="text-2xl font-bold">Ronda de reintentos</h2>
            <p className="text-muted-foreground">
              {retryQueue.length} estructura{retryQueue.length === 1 ? '' : 's'} para reintentar.
            </p>
            <Button onClick={beginRetryRound} size="lg" autoFocus>
              Continuar
            </Button>
            <p className="text-xs text-muted-foreground">Enter para continuar</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============ Subcomponents ============

function PreStart({
  sessionSize, setSessionSize, summary, selectionMode, setSelectionMode, onStart,
}: {
  sessionSize: number;
  setSessionSize: (n: number) => void;
  summary?: { reviewsInSession?: number; newInSession?: number; remainingReviews?: number; totalCount?: number };
  selectionMode: 'fifo' | 'lifo' | 'random';
  setSelectionMode: (m: 'fifo' | 'lifo' | 'random') => void;
  onStart: () => void;
}) {
  return (
    <Card>
      <CardContent className="pt-6 pb-6 space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold">Configura la sesión</h2>
          <p className="text-sm text-muted-foreground">
            Un ejemplo por estructura. Si fallas, escribes la corrección y la estructura vuelve al final en una ronda de reintentos. Solo sube nivel SRS si aciertas a la primera.
          </p>
        </div>

        <SessionSizeControl value={sessionSize} onChange={setSessionSize} summary={summary} />

        <div>
          <label className="text-sm font-medium mb-2 block">¿Qué estructuras nuevas priorizar?</label>
          <div className="grid grid-cols-3 gap-2">
            <Button variant={selectionMode === 'fifo' ? 'default' : 'outline'} size="sm" onClick={() => setSelectionMode('fifo')}>Más antiguas</Button>
            <Button variant={selectionMode === 'lifo' ? 'default' : 'outline'} size="sm" onClick={() => setSelectionMode('lifo')}>Más nuevas</Button>
            <Button variant={selectionMode === 'random' ? 'default' : 'outline'} size="sm" onClick={() => setSelectionMode('random')}>Aleatorio</Button>
          </div>
        </div>

        <Button onClick={onStart} className="w-full" size="lg" disabled={summary?.totalCount === 0}>
          Comenzar{summary?.totalCount !== undefined ? ` (${summary.totalCount})` : ''}
        </Button>
      </CardContent>
    </Card>
  );
}

function FullCenter({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-center h-screen">{children}</div>;
}
