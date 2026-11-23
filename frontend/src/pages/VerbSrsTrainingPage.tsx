import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCircle2, Loader2, TimerReset, Check, X as XIcon,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { verbSrsApi, verbsApi, type SrsConjugationItem } from '../services/api';
import { Sparkles } from 'lucide-react';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ù', 'û', 'œ'];

const PERSON_LABELS: Record<string, string> = {
  je: '1ʳᵉ p. sg.',
  tu: '2ᵉ p. sg.',
  'il/elle': '3ᵉ p. sg.',
  nous: '1ʳᵉ p. pl.',
  vous: '2ᵉ p. pl.',
  'ils/elles': '3ᵉ p. pl.',
};
const PERSON_ORDER = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

// Pedagogical order for French tenses. Groups appearing in the session are
// sorted by this list — présent before imparfait before passé composé, etc.
const TENSE_ORDER = [
  'indicatif_présent',
  'indicatif_imparfait',
  'indicatif_passé_composé',
  'indicatif_plus_que_parfait',
  'indicatif_passé_simple',
  'indicatif_futur_simple',
  'indicatif_futur_antérieur',
  'indicatif_futur_proche',
  'subjonctif_présent',
  'subjonctif_imparfait',
  'subjonctif_passé',
  'subjonctif_plus_que_parfait',
  'conditionnel_présent',
  'conditionnel_passé',
  'impératif_présent',
  'impératif_passé',
];

interface Group {
  key: string;
  verbId: string;
  infinitive: string;
  tense: string;
  items: SrsConjugationItem[]; // sorted by PERSON_ORDER
}

interface RowState {
  answer: string;
  status: 'pending' | 'correct' | 'wrong';
  expected: string;
}

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[.!?,;:]+$/, '');
}

function groupItems(items: SrsConjugationItem[]): Group[] {
  const map = new Map<string, Group>();
  for (const it of items) {
    const key = `${it.verbId}::${it.tense}`;
    if (!map.has(key)) {
      map.set(key, { key, verbId: it.verbId, infinitive: it.verb.infinitive, tense: it.tense, items: [] });
    }
    map.get(key)!.items.push(it);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.items.sort((a, b) => {
      const ai = PERSON_ORDER.indexOf(a.person);
      const bi = PERSON_ORDER.indexOf(b.person);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }
  // Universal tense order (indicatif présent → imparfait → passé composé → …).
  // Any tense not in TENSE_ORDER falls back to alphabetic sorting at the end.
  groups.sort((a, b) => {
    const ai = TENSE_ORDER.indexOf(a.tense);
    const bi = TENSE_ORDER.indexOf(b.tense);
    const av = ai === -1 ? 999 : ai;
    const bv = bi === -1 ? 999 : bi;
    if (av !== bv) return av - bv;
    return a.tense.localeCompare(b.tense);
  });
  return groups;
}

export default function VerbSrsTrainingPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [started, setStarted] = useState(false);
  const [selectedVerbId, setSelectedVerbId] = useState<string | null>(null);

  const [groupIndex, setGroupIndex] = useState(0);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [correctCount, setCorrectCount] = useState(0); // SRS levels advanced
  const [answeredCount, setAnsweredCount] = useState(0); // unique conjugations settled correct
  const [done, setDone] = useState(false);
  const [verifying, setVerifying] = useState(false);
  // Phases:
  //  'input'        → user is filling in answers for the tense group.
  //  'reviewing'    → just verified; wrong rows show the correction in red (read-only).
  //                    Correct rows are locked green. User clicks "Continuar" to move on.
  //  'retype'       → wrong rows are empty inputs; user must type the reference form
  //                    exactly (client-side match). Then jumps to next tense.
  //  'verified'     → all rows correct on first pass; "Continuar" advances.
  //  'retry-banner' → all tenses in this round done; starts the next retry round.
  const [groupPhase, setGroupPhase] = useState<'input' | 'reviewing' | 'retype' | 'verified' | 'retry-banner'>('input');

  // Session-level rounds: the current round's tense groups + the queue of groups
  // that failed in this round and need a fresh attempt in the NEXT round.
  // Retry groups always contain ALL rows of the tense; already-correct rows are
  // pre-locked green via sessionMasteredIdsRef so the user only re-inputs the
  // ones they missed (matching vocab's failedInRound → next round pattern).
  const [currentRound, setCurrentRound] = useState<Group[]>([]);
  const [retryQueue, setRetryQueue] = useState<Group[]>([]);
  const [roundNumber, setRoundNumber] = useState(1);
  // Conjugation IDs that the user has already verified as correct in this session.
  // Used to pre-lock rows on retry rounds so they show as green + read-only.
  const sessionMasteredIdsRef = useRef<Set<string>>(new Set());

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Verb list — used to auto-pick the verb of the day (least-mastered with pending work).
  const { data: verbList } = useQuery({
    queryKey: ['verbs-with-progress', languageId],
    queryFn: () => verbsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
    refetchOnWindowFocus: false,
  });

  // Auto-select the verb of the day as soon as the list is available.
  // Priority: (1) never-introduced verbs first (user's preference — expand the
  // repertoire before drilling reviews), (2) then verbs with reviews due today,
  // (3) then least mastered, (4) desempate por más pendientes.
  useEffect(() => {
    if (started || selectedVerbId || !verbList || verbList.length === 0) return;
    const withProgress = verbList
      .map((v) => {
        const total = v.conjugations.length;
        const mastered = v.conjugations.filter((c) => (c.srsLevel ?? 0) >= 6).length;
        const dueToday = v.conjugations.filter((c) => {
          const lvl = c.srsLevel ?? 0;
          if (lvl <= 0 || lvl >= 6) return false;
          if (!c.nextReviewAt) return false;
          return new Date(c.nextReviewAt).getTime() <= Date.now();
        }).length;
        const pending = v.conjugations.filter((c) => (c.srsLevel ?? 0) === 0 && !c.lastTrainedAt).length;
        // "Never introduced" = no historical attempts at all. We can't use
        // lastTrainedAt here because the overdue penalty nulls it out (which
        // would make a verb you've trained hundreds of times look "brand new").
        const neverIntroduced = v.conjugations.every((c) => (c.attempts ?? 0) === 0);
        return { verb: v, total, mastered, dueToday, pending, neverIntroduced, progress: total > 0 ? mastered / total : 0 };
      })
      .sort((a, b) => {
        if (a.neverIntroduced !== b.neverIntroduced) return a.neverIntroduced ? -1 : 1;
        if ((a.dueToday > 0) !== (b.dueToday > 0)) return a.dueToday > 0 ? -1 : 1;
        if (a.progress !== b.progress) return a.progress - b.progress;
        return b.pending - a.pending;
      });
    const pick = withProgress.find((r) => r.total > 0 && r.mastered < r.total);
    if (pick) setSelectedVerbId(pick.verb.id);
  }, [verbList, selectedVerbId, started]);

  const { data, isLoading } = useQuery({
    // newCount: 999 forces getDaily to return ALL pending tenses of the picked verb,
    // not just N — one session covers every conjugation the verb still owes us.
    queryKey: ['verb-srs-daily', languageId, selectedVerbId, started],
    queryFn: () =>
      verbSrsApi.getDaily(languageId!, {
        newCount: 999,
        selectionMode: 'fifo',
        verbIds: selectedVerbId ? [selectedVerbId] : undefined,
      }),
    enabled: started && !!languageId && !!selectedVerbId,
    refetchOnWindowFocus: false,
  });

  const initialGroups = useMemo(() => (data ? groupItems(data.conjugations) : []), [data]);
  const totalConjugations = useMemo(() => initialGroups.reduce((n, g) => n + g.items.length, 0), [initialGroups]);
  // Index: verbId::tense → full original group, so retry rounds can rebuild
  // the tense with ALL 6 rows regardless of how many failed in the previous round.
  const initialGroupsByBaseKey = useMemo(() => {
    const m = new Map<string, Group>();
    for (const g of initialGroups) m.set(`${g.verbId}::${g.tense}`, g);
    return m;
  }, [initialGroups]);
  const currentGroup = currentRound[groupIndex];

  // Bootstrap the first round when data arrives
  useEffect(() => {
    if (data && started && currentRound.length === 0 && initialGroups.length > 0) {
      setCurrentRound(initialGroups);
    }
  }, [data, started, currentRound.length, initialGroups]);

  // Initialize rows when entering a new group. Rows already-mastered in this
  // session start pre-locked (green, read-only, populated with the reference)
  // so retry rounds show the whole tense with only the failed rows editable.
  useEffect(() => {
    if (!currentGroup) return;
    const initial: Record<string, RowState> = {};
    for (const it of currentGroup.items) {
      const alreadyMastered = sessionMasteredIdsRef.current.has(it.id);
      initial[it.id] = {
        answer: alreadyMastered ? it.form : '',
        status: alreadyMastered ? 'correct' : 'pending',
        expected: it.form,
      };
    }
    setRows(initial);
    setGroupPhase('input');
    setTimeout(() => {
      // Focus the first still-editable row (not one pre-locked from a prior round).
      const firstId =
        currentGroup.items.find((it) => !sessionMasteredIdsRef.current.has(it.id))?.id ??
        currentGroup.items[0]?.id;
      if (firstId) inputRefs.current[firstId]?.focus();
    }, 50);
  }, [currentGroup]);

  // Detect empty session
  useEffect(() => {
    if (data && started && initialGroups.length === 0) setDone(true);
  }, [data, started, initialGroups.length]);

  // Refresh sidebar badges when a session finishes.
  useEffect(() => {
    if (!done || !languageId) return;
    queryClient.invalidateQueries({ queryKey: ['due-counts', languageId] });
    queryClient.invalidateQueries({ queryKey: ['verbs-with-progress', languageId] });
  }, [done, languageId, queryClient]);

  /**
   * Verify all input rows against the server. Advances SRS for correct rows
   * (only in round 1 — retry rounds don't earn level bumps). Transitions to
   * 'reviewing' if any wrong, else 'verified'.
   */
  const verifyAll = useCallback(async () => {
    if (!currentGroup || verifying || groupPhase !== 'input') return;
    setVerifying(true);

    // Skip rows pre-locked from a previous round; verify only the ones the user
    // is actually working on this pass.
    const snapshot = currentGroup.items
      .filter((it) => rows[it.id]?.status !== 'correct')
      .map((it) => ({
        id: it.id,
        answer: rows[it.id]?.answer ?? '',
        expected: rows[it.id]?.expected ?? it.form,
      }));

    const results = await Promise.all(snapshot.map(async (r) => {
      if (!r.answer.trim()) {
        return { id: r.id, correct: false, expected: r.expected, empty: true };
      }
      try {
        const res = await verbSrsApi.validate(r.id, r.answer);
        return { id: r.id, correct: res.correct, expected: res.expectedAnswer, empty: false };
      } catch {
        return { id: r.id, correct: false, expected: r.expected, empty: false };
      }
    }));

    // SRS advance only in round 1 (first appearance of this conjugation this session).
    const isFirstRound = roundNumber === 1;
    if (isFirstRound) {
      const advances = results
        .filter((r) => r.correct)
        .map((r) => verbSrsApi.advance(r.id).catch(() => undefined));
      await Promise.allSettled(advances);
    }

    setRows((prev) => {
      const next = { ...prev };
      for (const r of results) {
        next[r.id] = {
          ...next[r.id],
          status: r.correct ? 'correct' : 'wrong',
          expected: r.expected,
        };
      }
      return next;
    });

    // Remember correct rows so future retry rounds can pre-lock them green.
    for (const r of results) {
      if (r.correct) sessionMasteredIdsRef.current.add(r.id);
    }

    setAnsweredCount((n) => n + results.filter((r) => r.correct).length);
    if (isFirstRound) {
      setCorrectCount((n) => n + results.filter((r) => r.correct).length);
    }

    const anyWrong = results.some((r) => !r.correct);
    if (anyWrong) {
      setGroupPhase('reviewing');
    } else {
      setGroupPhase('verified');
    }
    setVerifying(false);
  }, [currentGroup, verifying, groupPhase, rows, roundNumber]);

  /** From 'reviewing' → 'retype': wrong rows become empty inputs; user must
   * type the reference exactly (client-side match). Correct rows stay locked. */
  const startRetypePass = useCallback(() => {
    if (!currentGroup) return;
    setRows((prev) => {
      const next = { ...prev };
      for (const it of currentGroup.items) {
        if (next[it.id]?.status === 'wrong') {
          next[it.id] = { ...next[it.id], answer: '' };
        }
      }
      return next;
    });
    setGroupPhase('retype');
    const firstWrongId = currentGroup.items.find((it) => rows[it.id]?.status === 'wrong')?.id;
    if (firstWrongId) setTimeout(() => inputRefs.current[firstWrongId]?.focus(), 50);
  }, [currentGroup, rows]);

  /** Client-side literal check of retyped forms against the reference. Rows
   * that don't match are cleared so the user tries again. Once every wrong row
   * matches, the group is queued for next round and we jump to the next tense. */
  const verifyRetype = useCallback(() => {
    if (!currentGroup || groupPhase !== 'retype') return;
    let anyMismatch = false;
    setRows((prev) => {
      const next = { ...prev };
      let firstMismatchId: string | null = null;
      for (const it of currentGroup.items) {
        const row = next[it.id];
        if (!row || row.status === 'correct') continue;
        const typed = (row.answer ?? '').normalize('NFC').toLowerCase().trim();
        const expected = (row.expected ?? it.form).normalize('NFC').toLowerCase().trim();
        if (typed === expected) {
          // Retype accepted for this row (stay 'wrong' visually so it doesn't
          // count as a first-pass correct, but the answer now matches).
          next[it.id] = { ...row, answer: it.form };
        } else {
          anyMismatch = true;
          if (!firstMismatchId) firstMismatchId = it.id;
          next[it.id] = { ...row, answer: '' };
        }
      }
      if (firstMismatchId) setTimeout(() => inputRefs.current[firstMismatchId!]?.focus(), 30);
      return next;
    });
    if (anyMismatch) return;
    // All retypes match. Queue the FULL tense (all 6 rows) for the next round —
    // sessionMasteredIdsRef will pre-lock the ones already correct, and the user
    // only re-inputs the ones they missed.
    const failedItems = currentGroup.items.filter((it) => rows[it.id]?.status === 'wrong');
    if (failedItems.length > 0) {
      const baseKey = `${currentGroup.verbId}::${currentGroup.tense}`;
      const full = initialGroupsByBaseKey.get(baseKey) ?? currentGroup;
      const subset: Group = {
        key: `${baseKey}::retry-${roundNumber}`,
        verbId: currentGroup.verbId,
        infinitive: currentGroup.infinitive,
        tense: currentGroup.tense,
        items: full.items,
      };
      setRetryQueue((q) => [...q, subset]);
    }
    // Advance
    if (groupIndex + 1 >= currentRound.length) {
      // End of round. Check retry queue.
      if (failedItems.length > 0 || retryQueue.length > 0) {
        setGroupPhase('retry-banner');
      } else {
        setDone(true);
      }
    } else {
      setGroupIndex((i) => i + 1);
    }
  }, [currentGroup, groupPhase, rows, groupIndex, currentRound.length, retryQueue.length, roundNumber, initialGroupsByBaseKey]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>, conjugationId: string) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!currentGroup) return;
    const idx = currentGroup.items.findIndex((it) => it.id === conjugationId);
    // Find next editable (non-correct) row after this one.
    let nextEditableId: string | null = null;
    for (let i = idx + 1; i < currentGroup.items.length; i++) {
      const rid = currentGroup.items[i].id;
      if (rows[rid]?.status !== 'correct') { nextEditableId = rid; break; }
    }
    if (nextEditableId) {
      inputRefs.current[nextEditableId]?.focus();
    } else if (groupPhase === 'retype') {
      verifyRetype();
    } else {
      verifyAll();
    }
  }, [currentGroup, verifyAll, verifyRetype, rows, groupPhase]);

  const continueToNext = useCallback(() => {
    if (!currentGroup) return;
    if (groupIndex + 1 >= currentRound.length) {
      if (retryQueue.length > 0) {
        setGroupPhase('retry-banner');
      } else {
        setDone(true);
      }
    } else {
      setGroupIndex((i) => i + 1);
    }
  }, [currentGroup, groupIndex, currentRound.length, retryQueue.length]);

  /** From 'retry-banner' → next round: swap in the retry queue. */
  const beginRetryRound = useCallback(() => {
    setCurrentRound(retryQueue);
    setRetryQueue([]);
    setGroupIndex(0);
    setRoundNumber((r) => r + 1);
    // useEffect on currentGroup will reset per-group state
  }, [retryQueue]);

  // Keyboard shortcuts per phase.
  useEffect(() => {
    if (groupPhase === 'input' || groupPhase === 'retype') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (groupPhase === 'verified') continueToNext();
      else if (groupPhase === 'reviewing') startRetypePass();
      else if (groupPhase === 'retry-banner') beginRetryRound();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [groupPhase, continueToNext, startRetypePass, beginRetryRound]);

  const insertChar = useCallback((char: string) => {
    const el = document.activeElement as HTMLInputElement | null;
    if (!el || el.tagName !== 'INPUT') return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const person = el.getAttribute('data-conj-id');
    if (!person) return;
    const currentVal = el.value;
    const newVal = currentVal.slice(0, start) + char + currentVal.slice(end);
    setRows((prev) => ({ ...prev, [person]: { ...prev[person], answer: newVal } }));
    setTimeout(() => { el.focus(); el.setSelectionRange(start + 1, start + 1); }, 0);
  }, []);

  // ============ Render ============

  if (!started) {
    const verbs = verbList ?? [];
    // Compute per-verb progress and auto-pick the least-mastered verb of the day.
    const verbsWithProgress = verbs.map((v) => {
      const total = v.conjugations.length;
      const mastered = v.conjugations.filter((c) => (c.srsLevel ?? 0) >= 6).length;
      const dueToday = v.conjugations.filter((c) => {
        const lvl = c.srsLevel ?? 0;
        if (lvl <= 0 || lvl >= 6) return false;
        if (!c.nextReviewAt) return false;
        return new Date(c.nextReviewAt).getTime() <= Date.now();
      }).length;
      const pending = v.conjugations.filter((c) => (c.srsLevel ?? 0) === 0 && !c.lastTrainedAt).length;
      const neverIntroduced = v.conjugations.every((c) => !c.lastTrainedAt);
      const progress = total > 0 ? mastered / total : 0;
      return { verb: v, total, mastered, dueToday, pending, neverIntroduced, progress };
    }).sort((a, b) => {
      // Priority 1: verbs never introduced (user's preference — expand the
      // repertoire before drilling reviews).
      if (a.neverIntroduced !== b.neverIntroduced) return a.neverIntroduced ? -1 : 1;
      // Priority 2: verbs with reviews due today.
      if ((a.dueToday > 0) !== (b.dueToday > 0)) return a.dueToday > 0 ? -1 : 1;
      // Priority 3: least mastered.
      if (a.progress !== b.progress) return a.progress - b.progress;
      // Priority 4: more pending new conjugations.
      return b.pending - a.pending;
    });
    const todaysVerb = verbsWithProgress.find((r) => r.total > 0 && r.mastered < r.total) ?? null;

    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/languages/${languageId}/verbs`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Entrenamiento SRS de verbos</h1>
            <p className="text-muted-foreground mt-1">
              Un verbo por sesión — todos los tiempos, todas las personas. El verbo se elige automáticamente (el menos dominado con trabajo pendiente).
            </p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-8 pb-8 space-y-6">
            {!todaysVerb ? (
              <div className="text-center space-y-3 py-4">
                <Sparkles className="w-10 h-10 text-muted-foreground mx-auto" />
                <p className="text-muted-foreground">
                  {verbsWithProgress.length === 0
                    ? 'No hay verbos todavía. Añade alguno desde la página de verbos.'
                    : 'Ya has dominado todos los verbos disponibles. ¡Bien hecho!'}
                </p>
              </div>
            ) : (
              <>
                <div className="text-center space-y-2">
                  <div className="text-xs uppercase text-muted-foreground tracking-wider">Verbo del día</div>
                  <div className="text-4xl font-bold">{todaysVerb.verb.infinitive}</div>
                  <div className="text-sm text-muted-foreground">
                    {todaysVerb.mastered}/{todaysVerb.total} conjugaciones dominadas
                    {todaysVerb.dueToday > 0 && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full">
                        {todaysVerb.dueToday} debidas hoy
                      </span>
                    )}
                  </div>
                </div>

                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.round(todaysVerb.progress * 100)}%` }}
                  />
                </div>

                <Button onClick={() => setStarted(true)} className="w-full" size="lg">
                  Comenzar
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (done) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <Card>
          <CardContent className="pt-8 pb-8 text-center space-y-4">
            <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
            <h2 className="text-3xl font-bold">¡Sesión completada!</h2>
            <div className="text-muted-foreground space-y-1">
              <p>{answeredCount} conjugacion{answeredCount === 1 ? '' : 'es'} entrenadas</p>
              <p>{correctCount} subieron de nivel SRS</p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <Button variant="outline" onClick={() => navigate(`/languages/${languageId}/verbs`)}>Volver</Button>
              <Button onClick={() => {
                setStarted(false); setGroupIndex(0); setCorrectCount(0); setAnsweredCount(0); setDone(false); setRows({}); setSelectedVerbId(null);
                setCurrentRound([]); setRetryQueue([]); setRoundNumber(1);
                sessionMasteredIdsRef.current = new Set();
              }}>
                <TimerReset className="w-4 h-4 mr-1" /> Otra sesión
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!currentGroup) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const groupLabels = currentGroup.items.map((it) => it.label);
  const badgeLabel =
    groupLabels.every((l) => l === 'nueva') ? { text: 'Nueva', cls: 'bg-blue-100 text-blue-900' } :
    groupLabels.some((l) => l === 'atrasada') ? { text: 'Atrasada', cls: 'bg-amber-100 text-amber-900' } :
    { text: 'Repaso', cls: '' };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {(() => {
        const progress = totalConjugations === 0 ? 0 : (answeredCount / totalConjugations) * 100;
        return (
          <div className="flex items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/languages/${languageId}/verbs`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Salir
            </Button>
            <div className="flex-1 flex items-center gap-3">
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-green-500 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="text-sm font-medium tabular-nums whitespace-nowrap">
                {answeredCount}/{totalConjugations}
              </div>
            </div>
            {roundNumber > 1 && (
              <span className="text-xs bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full whitespace-nowrap">
                Ronda {roundNumber}
              </span>
            )}
            {retryQueue.length > 0 && (
              <span className="text-xs bg-red-100 text-red-900 px-2 py-0.5 rounded-full whitespace-nowrap">
                {retryQueue.length} para reintento
              </span>
            )}
          </div>
        );
      })()}

      {groupPhase === 'retry-banner' && (
        <Card className="border-2 border-amber-300">
          <CardContent className="pt-10 pb-10 text-center space-y-4">
            <TimerReset className="w-12 h-12 text-amber-600 mx-auto" />
            <h2 className="text-2xl font-bold">Ronda de reintentos</h2>
            <p className="text-muted-foreground">
              {retryQueue.length} tiempo{retryQueue.length === 1 ? '' : 's'} con formas por reintentar.
            </p>
            <Button onClick={beginRetryRound} size="lg" autoFocus>Continuar</Button>
            <p className="text-xs text-muted-foreground">Enter para continuar</p>
          </CardContent>
        </Card>
      )}

      {groupPhase !== 'retry-banner' && (

      <Card className="border-2 shadow-lg">
        <CardContent className="pt-6 pb-6 space-y-5">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className={badgeLabel.cls}>{badgeLabel.text}</Badge>
            <span className="text-xs text-muted-foreground">
              {currentGroup.items.length} / 6 personas debidas
            </span>
          </div>

          <div>
            <h1 className="text-3xl font-bold">{currentGroup.infinitive}</h1>
            <h2 className="text-lg font-semibold text-muted-foreground mt-1">
              {currentGroup.tense.replace(/_/g, ' ')}
            </h2>
          </div>

          <div className="border rounded-lg overflow-hidden">
            {currentGroup.items.map((it) => {
              const row = rows[it.id];
              if (!row) return null;
              const isReviewing = groupPhase === 'reviewing';
              const isVerified = groupPhase === 'verified';
              const isInput = groupPhase === 'input';
              const isRetype = groupPhase === 'retype';
              const isCorrect = row.status === 'correct';
              const isWrong = row.status === 'wrong';
              // Correct rows are always locked (green text, not editable).
              // In 'reviewing' phase, wrong rows show the correction as text (red).
              // In 'input' or 'retype', wrong rows are editable.
              const lockedGreen = isCorrect;
              const showAsText = lockedGreen || isVerified || (isReviewing && isWrong);
              const personLabel = PERSON_LABELS[it.person] ?? it.person;
              return (
                <div
                  key={it.id}
                  className={`flex items-stretch border-b last:border-b-0 ${
                    lockedGreen ? 'bg-green-100'
                    : (isVerified || isReviewing) && isWrong ? 'bg-red-100'
                    : isWrong ? 'bg-red-50'
                    : ''
                  }`}
                >
                  <div className={`w-28 shrink-0 p-3 border-r flex items-center font-medium text-sm ${
                    isWrong && !isCorrect ? 'bg-red-200/60' : ''
                  }`}>
                    {personLabel}
                  </div>
                  <div className="flex-1 flex items-center px-3">
                    {showAsText ? (
                      <div className="flex-1 py-3 flex items-center gap-2 flex-wrap">
                        {isCorrect ? (
                          <span className="text-green-900 font-medium">{row.answer || row.expected}</span>
                        ) : row.answer.trim() ? (
                          <>
                            <span className="text-red-900 font-medium">{row.answer}</span>
                            <span className="text-red-900 font-medium">({row.expected})</span>
                          </>
                        ) : (
                          <span className="text-red-900 font-medium italic">({row.expected})</span>
                        )}
                      </div>
                    ) : (
                      <Input
                        ref={(el) => { inputRefs.current[it.id] = el; }}
                        data-conj-id={it.id}
                        value={row.answer}
                        onChange={(e) => setRows((prev) => ({ ...prev, [it.id]: { ...prev[it.id], answer: e.target.value } }))}
                        onKeyDown={(e) => handleKeyDown(e, it.id)}
                        className={`border-0 focus-visible:ring-0 bg-transparent h-11 px-0 ${isWrong || isRetype ? 'placeholder:text-red-400' : ''}`}
                        placeholder={
                          isRetype ? `Copia: ${row.expected}`
                          : isWrong ? 'Reintenta esta forma…'
                          : 'Escribe la forma…'
                        }
                        disabled={verifying}
                      />
                    )}
                  </div>
                  <div className="pr-3 flex items-center">
                    {isCorrect ? <Check className="w-5 h-5 text-green-700" />
                     : isVerified ? <XIcon className="w-5 h-5 text-red-600" />
                     : isWrong ? <XIcon className="w-5 h-5 text-red-400" />
                     : null}
                  </div>
                </div>
              );
            })}
          </div>

          {(groupPhase === 'input' || groupPhase === 'retype') && (
            <div className="flex flex-wrap gap-1 justify-center">
              {FRENCH_CHARS.map((char) => (
                <Button
                  key={char}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => insertChar(char)}
                  className="min-w-[40px]"
                >
                  {char}
                </Button>
              ))}
            </div>
          )}

          {groupPhase === 'input' && (
            <Button
              onClick={verifyAll}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
              disabled={verifying}
            >
              {verifying ? 'Comprobando…' : 'Verificar'}
            </Button>
          )}
          {groupPhase === 'reviewing' && (
            <Button onClick={startRetypePass} className="w-full" size="lg" autoFocus>
              Continuar (copiar las correcciones)
            </Button>
          )}
          {groupPhase === 'retype' && (
            <Button onClick={verifyRetype} className="w-full" size="lg">
              Continuar al siguiente tiempo
            </Button>
          )}
          {groupPhase === 'verified' && (
            <Button onClick={continueToNext} className="w-full" size="lg" autoFocus>
              {groupIndex + 1 >= currentRound.length && retryQueue.length === 0
                ? 'Terminar sesión'
                : 'Continuar'}
            </Button>
          )}

          {groupPhase === 'input' && (
            <p className="text-xs text-muted-foreground text-center">
              Rellena todas las filas y pulsa <strong>Verificar</strong>. Enter salta al siguiente input; en la última fila envía.
            </p>
          )}
          {groupPhase === 'reviewing' && (
            <p className="text-xs text-muted-foreground text-center">
              Repasa las correcciones en rojo. En el siguiente paso las copiarás y luego pasarás al siguiente tiempo.
            </p>
          )}
          {groupPhase === 'retype' && (
            <p className="text-xs text-muted-foreground text-center">
              Copia cada forma exactamente. Los fallos vuelven en la ronda de reintentos al final.
            </p>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
