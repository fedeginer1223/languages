import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Volume2, Star, Headphones } from 'lucide-react';
import { dictationApi, topicsApi, languagesApi } from '../services/api';
import type { SrsWord } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

const FRENCH_CHARS = ['à', 'â', 'ç', 'é', 'è', 'ê', 'ë', 'í', 'î', 'ñ', 'ó', 'ù', '^'];

function normAnswer(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .trim()
    .replace(/[‘’‛′ʼ]/g, "'")
    .replace(/[“”‟″]/g, '"')
    .replace(/[.!?,;:]+$/, '');
}

/** Map our language codes to BCP-47 tags used by SpeechSynthesis. */
function bcp47From(code: string): string {
  const c = code.toLowerCase();
  if (c === 'fr' || c.startsWith('fr-')) return 'fr-FR';
  if (c === 'es' || c.startsWith('es-')) return 'es-ES';
  if (c === 'en' || c.startsWith('en-')) return 'en-US';
  if (c === 'it' || c.startsWith('it-')) return 'it-IT';
  if (c === 'de' || c.startsWith('de-')) return 'de-DE';
  if (c === 'pt' || c.startsWith('pt-')) return 'pt-PT';
  return code;
}

function pickVoice(bcp47: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  const prefix = bcp47.split('-')[0];
  // Prefer exact match, then any voice starting with the language prefix
  return (
    voices.find((v) => v.lang === bcp47) ||
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
    null
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

export default function DictationTrainingPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const [searchParams] = useSearchParams();
  const urlTopicIds = searchParams.get('topicIds')?.split(',').filter(Boolean) || undefined;
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    urlTopicIds && urlTopicIds.length === 1 ? urlTopicIds[0] : null
  );
  const topicIds = selectedTopicId ? [selectedTopicId] : urlTopicIds;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);

  const [started, setStarted] = useState(false);
  const [queue, setQueue] = useState<SrsWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [failedInRound, setFailedInRound] = useState<SrsWord[]>([]);
  const [showRetryBanner, setShowRetryBanner] = useState(false);
  const [todayLearned, setTodayLearned] = useState(0);
  const [newWordCount, setNewWordCount] = useState(15);
  const [selectionMode, setSelectionMode] = useState<'fifo' | 'lifo' | 'random'>('random');
  // Phonetic filter — presets or custom regex. Empty string = no filter.
  const [phoneticPreset, setPhoneticPreset] = useState<string>('');
  const [customRegex, setCustomRegex] = useState<string>('');

  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<{ correct: boolean; expectedAnswer: string; userAnswer?: string } | null>(null);
  const [isRetyping, setIsRetyping] = useState(false);
  const [retypeAnswer, setRetypeAnswer] = useState('');
  const [playCount, setPlayCount] = useState(0);
  const [hintRevealed, setHintRevealed] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [useBrowserTts, setUseBrowserTts] = useState(false);
  const [openaiVoice, setOpenaiVoice] = useState<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'>('nova');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string>('');
  const [voicesReady, setVoicesReady] = useState(true); // start ready; browser fallback loads lazily
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: language } = useQuery({
    queryKey: ['language', languageId],
    queryFn: () => languagesApi.getById(languageId!),
    enabled: !!languageId,
  });

  const { data: topics } = useQuery({
    queryKey: ['topics', languageId],
    queryFn: () => topicsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  // Presets → regex source. All Unicode-normalized on the backend.
  const PHONETIC_PRESETS: Record<string, { label: string; regex: string }> = {
    '': { label: 'Todas las palabras', regex: '' },
    'e-any': { label: 'e y variantes (e/é/è/ê/ë)', regex: '[eéèêë]' },
    'e-acute': { label: 'con é (acento agudo)', regex: 'é' },
    'e-grave-circum': { label: 'con è o ê (grave/circunflejo)', regex: '[èê]' },
    'circumflex': { label: 'con ^ (â/ê/î/ô/û)', regex: '[âêîôû]' },
    'nasal': { label: 'nasales (an/en/in/on/un)', regex: '(?:an|en|in|on|un|am|em|im|om|um)(?![aeiouàâéèêëîïôùûüœ])' },
    'cedilla': { label: 'con ç', regex: 'ç' },
    'trema': { label: 'con diéresis (ë/ï/ü)', regex: '[ëïü]' },
    'oe-ae': { label: 'con œ o æ', regex: '[œæ]' },
    'custom': { label: 'Personalizado (regex)', regex: '__custom__' },
  };
  const effectiveFilter = phoneticPreset === 'custom' ? customRegex.trim() : (PHONETIC_PRESETS[phoneticPreset]?.regex || '');

  const { data: dailySession, isLoading } = useQuery({
    queryKey: ['dictation-daily', languageId, topicIds, newWordCount, selectionMode, effectiveFilter],
    queryFn: () => dictationApi.getDailySession(languageId!, topicIds, newWordCount, selectionMode, effectiveFilter || undefined),
    enabled: !!languageId,
  });

  const bcp47 = language ? bcp47From(language.code) : 'fr-FR';

  // Load browser voices (only used in fallback mode)
  useEffect(() => {
    const check = () => {
      const vs = window.speechSynthesis.getVoices();
      if (vs.length > 0) {
        setAvailableVoices(vs);
        if (!selectedVoiceName && language) {
          const target = bcp47From(language.code);
          const prefix = target.split('-')[0];
          const match = vs.find((v) => v.lang === target) ||
                        vs.find((v) => v.lang.toLowerCase().startsWith(prefix));
          if (match) setSelectedVoiceName(match.name);
        }
      }
    };
    check();
    window.speechSynthesis.onvoiceschanged = check;
    return () => { window.speechSynthesis.onvoiceschanged = null; };
  }, [language, selectedVoiceName]);

  const currentWord = queue[currentIndex] || null;

  const speakBrowser = useCallback((text: string) => {
    try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = bcp47;
    const chosen = (selectedVoiceName && availableVoices.find((v) => v.name === selectedVoiceName)) ||
                   pickVoice(bcp47);
    if (chosen) utter.voice = chosen;
    utter.rate = 0.9;
    window.speechSynthesis.speak(utter);
  }, [bcp47, selectedVoiceName, availableVoices]);

  const speak = useCallback(async (text: string) => {
    if (!text) return;
    setTtsError(null);
    setPlayCount((n) => n + 1);

    if (useBrowserTts) {
      speakBrowser(text);
      return;
    }

    // OpenAI TTS via backend. The endpoint sets long-lived Cache-Control so
    // the browser HTTP cache eliminates repeat requests for the same word.
    try {
      const url = `/api/v1/tts?text=${encodeURIComponent(text)}&lang=${encodeURIComponent(language?.code || '')}&voice=${openaiVoice}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`${res.status}: ${errText.slice(0, 200)}`);
      }
      const blob = await res.blob();
      const audioUrl = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.pause();
        try { URL.revokeObjectURL(audioRef.current.src); } catch { /* ignore */ }
      }
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => { try { URL.revokeObjectURL(audioUrl); } catch { /* ignore */ } };
      await audio.play();
    } catch (e: any) {
      console.error('[TTS] backend failed, falling back to browser voice:', e);
      setTtsError(`OpenAI TTS falló (${e?.message || e}). Usando voz del navegador.`);
      setUseBrowserTts(true);
      speakBrowser(text);
    }
  }, [useBrowserTts, speakBrowser, language, openaiVoice]);

  // Auto-play when a new word appears — EXACTLY once per word id.
  const lastAutoPlayedId = useRef<string | null>(null);
  useEffect(() => {
    if (!currentWord || result || !voicesReady) return;
    if (lastAutoPlayedId.current === currentWord.id) return;
    lastAutoPlayedId.current = currentWord.id;
    setPlayCount(0);
    setHintRevealed(false);
    speak(currentWord.term);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [currentWord?.id, result, voicesReady, speak]);

  // Retype focus
  useEffect(() => {
    if (isRetyping && inputRef.current) setTimeout(() => inputRef.current?.focus(), 50);
  }, [isRetyping]);

  // Enter to trigger retype on failure
  useEffect(() => {
    if (!result || result.correct || isRetyping) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); setIsRetyping(true); setRetypeAnswer(''); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [result, isRetyping]);

  // Enter to dismiss retry banner
  useEffect(() => {
    if (!showRetryBanner) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); dismissRetryBanner(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [showRetryBanner]);

  // Space bar to replay (unless typing in an input... actually input has focus, so space types)
  // Only replay when result is showing.
  useEffect(() => {
    if (!currentWord) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'r' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (currentWord) speak(currentWord.term);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [currentWord, speak]);

  const handleStart = () => {
    if (!dailySession) return;
    const words = [...dailySession.words];
    if (words.length === 0) return;
    setQueue(words);
    setCurrentIndex(0);
    setFailedInRound([]);
    setStarted(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWord) return;
    const correct = normAnswer(answer) === normAnswer(currentWord.term);
    dictationApi.recordAttempt(currentWord.id, correct).catch(() => {});
    if (correct) {
      setResult({ correct: true, expectedAnswer: currentWord.term });
      setTodayLearned((n) => n + 1);
      dictationApi.advanceWord(currentWord.id).catch(() => {});
      setTimeout(() => advance(), 600);
    } else {
      setResult({ correct: false, expectedAnswer: currentWord.term, userAnswer: answer });
      setFailedInRound((prev) => [...prev, currentWord]);
    }
  };

  const handleMarkAsCorrect = () => {
    if (!currentWord) return;
    setResult({ correct: true, expectedAnswer: currentWord.term });
    setTodayLearned((n) => n + 1);
    setFailedInRound((prev) => prev.filter((w) => w.id !== currentWord.id));
    dictationApi.advanceWord(currentWord.id).catch(() => {});
    setTimeout(() => advance(), 500);
  };

  const handleRetypeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!result?.expectedAnswer) return;
    if (normAnswer(retypeAnswer) === normAnswer(result.expectedAnswer)) {
      setResult({ ...result, correct: true });
      setTimeout(() => advance(), 500);
    } else {
      setRetypeAnswer('');
    }
  };

  const advance = () => {
    setResult(null); setAnswer(''); setIsRetyping(false); setRetypeAnswer('');
    if (currentIndex + 1 < queue.length) setCurrentIndex(currentIndex + 1);
    else if (failedInRound.length > 0) setShowRetryBanner(true);
    else finish();
  };

  const dismissRetryBanner = () => {
    setShowRetryBanner(false);
    setQueue([...failedInRound]);
    setFailedInRound([]);
    setCurrentIndex(0);
  };

  const [finished, setFinished] = useState(false);
  const finish = () => setFinished(true);

  const insertChar = (c: string) => {
    if (isRetyping) setRetypeAnswer((p) => p + c); else setAnswer((p) => p + c);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Refresh sidebar badges when the session ends.
  useEffect(() => {
    if (!finished || !languageId) return;
    queryClient.invalidateQueries({ queryKey: ['due-counts', languageId] });
  }, [finished, languageId, queryClient]);

  if (isLoading) return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted-foreground">Cargando...</div></div>;

  // Pre-start
  if (!started) {
    const s = dailySession?.summary;
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center">
              <Headphones className="w-12 h-12 mx-auto mb-4 text-primary" />
              <h2 className="text-2xl font-bold">Dictado</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Escucha la palabra y escríbela
              </p>
            </div>
            {!voicesReady && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Cargando voces del navegador...
              </div>
            )}

            {/* Voice selector + test */}
            <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium whitespace-nowrap">Voz</p>
                <select
                  value={openaiVoice}
                  onChange={(e) => setOpenaiVoice(e.target.value as typeof openaiVoice)}
                  className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                  disabled={useBrowserTts}
                >
                  <option value="nova">Nova (femenina, cálida)</option>
                  <option value="shimmer">Shimmer (femenina, dulce)</option>
                  <option value="alloy">Alloy (neutra)</option>
                  <option value="fable">Fable (masculina, expresiva)</option>
                  <option value="echo">Echo (masculina, calmada)</option>
                  <option value="onyx">Onyx (masculina, profunda)</option>
                </select>
                <Button type="button" size="sm" variant="outline" onClick={() => speak(
                  language?.code === 'fr' ? 'Bonjour, ceci est un test'
                  : language?.code === 'es' ? 'Hola, esto es una prueba'
                  : language?.code === 'en' ? 'Hello, this is a test'
                  : 'Test'
                )}>
                  <Volume2 className="w-4 h-4 mr-1" /> Probar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                {useBrowserTts
                  ? `Modo fallback: voz del navegador (${bcp47})`
                  : `OpenAI TTS · idioma: ${bcp47}`}
              </p>
              {ttsError && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  {ttsError}
                </div>
              )}
            </div>
            {s && (<>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-amber-50 rounded-lg text-center"><p className="text-3xl font-bold text-amber-600">{s.reviewCount}</p><p className="text-sm text-muted-foreground">Recordar</p></div>
                <div className="p-4 bg-blue-50 rounded-lg text-center"><p className="text-3xl font-bold text-blue-600">{s.newCount}</p><p className="text-sm text-muted-foreground">Nuevas</p></div>
                <div className="p-4 bg-green-50 rounded-lg text-center"><p className="text-3xl font-bold text-green-600">{s.mastered}</p><p className="text-sm text-muted-foreground">Dominadas</p></div>
              </div>

              {(topics?.length ?? 0) > 0 && (
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

              {/* Phonetic filter */}
              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium whitespace-nowrap">Filtro fonético</p>
                  <select
                    value={phoneticPreset}
                    onChange={(e) => setPhoneticPreset(e.target.value)}
                    className="flex-1 h-9 rounded-md border border-input bg-background px-2 text-sm"
                  >
                    {Object.entries(PHONETIC_PRESETS).map(([key, { label }]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
                {phoneticPreset === 'custom' && (
                  <Input
                    value={customRegex}
                    onChange={(e) => setCustomRegex(e.target.value)}
                    placeholder="Regex (ej. [éè]|ç)"
                    className="text-sm h-9 font-mono"
                  />
                )}
                {effectiveFilter && phoneticPreset !== 'custom' && (
                  <p className="text-xs text-muted-foreground">
                    Patrón: <code>{effectiveFilter}</code>
                  </p>
                )}
                {s.totalInLanguage === 0 && (
                  <p className="text-xs text-red-600">Ninguna palabra coincide con este filtro.</p>
                )}
              </div>

              <div className="space-y-2 p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Palabras nuevas</p>
                  <span className="text-sm font-bold">{newWordCount}</span>
                </div>
                <input type="range" min="0" max={Math.min(50, s.pending)} value={newWordCount} onChange={e => setNewWordCount(parseInt(e.target.value))} className="w-full" />
              </div>

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
              <Button onClick={handleStart} size="lg" disabled={!s || s.totalCount === 0 || !voicesReady}>
                {!s || s.totalCount === 0 ? 'No hay palabras para hoy' : `Comenzar (${s.totalCount})`}
              </Button>
              <Button variant="outline" size="lg" onClick={() => navigate(-1)}>Volver</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-2xl w-full"><CardContent className="pt-12 pb-12 text-center">
          <Star className="w-16 h-16 mx-auto mb-4 text-yellow-500" />
          <h2 className="text-3xl font-bold mb-4">¡Dictado completado!</h2>
          <p className="text-xl text-muted-foreground mb-8">{todayLearned} palabra{todayLearned !== 1 ? 's' : ''} repasada{todayLearned !== 1 ? 's' : ''} hoy</p>
          <Button size="lg" onClick={() => navigate(-1)}>Volver</Button>
        </CardContent></Card>
      </div>
    );
  }

  if (showRetryBanner) {
    return (
      <div className="min-h-screen bg-background">
        <DictHeader navigate={navigate} learned={todayLearned} total={queue.length + todayLearned} />
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
      <DictHeader navigate={navigate} learned={todayLearned} total={queue.length + todayLearned} />
      <div className="max-w-5xl mx-auto px-6 mb-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Dictado</span>
            {currentWord.label === 'nueva' && <Badge className="bg-blue-100 text-blue-700 text-xs">Nueva</Badge>}
            {currentWord.label === 'recordar' && <Badge className="bg-amber-100 text-amber-700 text-xs">{['Recordar', seenLabel(currentWord)].filter(Boolean).join(' · ')}</Badge>}
            {currentWord.label === 'atrasada' && <Badge className="bg-red-100 text-red-700 text-xs">{badgeText('Atrasada', [overdueLabel(currentWord), seenLabel(currentWord)])}</Badge>}
          </div>
          <span>{currentIndex + 1}/{queue.length}</span>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6">
        <Card><CardContent className="pt-12 pb-12">
          {!result ? (
            <div className="space-y-8">
              <div className="flex flex-col items-center gap-4">
                <Button
                  type="button"
                  onClick={() => currentWord && speak(currentWord.term)}
                  size="lg"
                  className="h-24 w-24 rounded-full"
                  aria-label="Escuchar palabra"
                >
                  <Volume2 className="w-10 h-10" />
                </Button>
                <p className="text-xs text-muted-foreground">
                  {playCount === 0 ? 'Cargando audio...' : `Reproducido ${playCount} ${playCount === 1 ? 'vez' : 'veces'}`}
                  {' · Cmd/Ctrl+R para repetir'}
                </p>
                {ttsError && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2 max-w-md text-center">
                    {ttsError}
                  </div>
                )}
                {/* In-session voice picker */}
                <div className="w-full max-w-md flex items-center gap-2 mt-2 pt-3 border-t border-dashed">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">Voz:</span>
                  <select
                    value={openaiVoice}
                    onChange={(e) => setOpenaiVoice(e.target.value as typeof openaiVoice)}
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-xs"
                    disabled={useBrowserTts}
                  >
                    <option value="nova">Nova</option>
                    <option value="shimmer">Shimmer</option>
                    <option value="alloy">Alloy</option>
                    <option value="fable">Fable</option>
                    <option value="echo">Echo</option>
                    <option value="onyx">Onyx</option>
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={() => currentWord && speak(currentWord.term)}>
                    Repetir
                  </Button>
                </div>
                {hintRevealed ? (
                  <p className="text-sm italic text-muted-foreground">
                    Pista: <span className="font-medium">{currentWord.definition}</span>
                  </p>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    onClick={() => setHintRevealed(true)}
                  >
                    Revelar pista
                  </Button>
                )}
              </div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <p className="text-sm text-muted-foreground">Escribe lo que escuchas</p>
                <div className="flex gap-1 mb-3 flex-wrap">
                  {FRENCH_CHARS.map(c => <Button key={c} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(c)}>{c}</Button>)}
                </div>
                <Input
                  ref={inputRef}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  placeholder="Escribe la palabra"
                  autoFocus
                  className="text-lg py-6"
                />
                <div className="flex justify-end"><Button type="submit" size="lg">Responder</Button></div>
              </form>
            </div>
          ) : (
            <>
              {result.correct ? (
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">¡Correcto!</div>
                  <div className="text-xl mt-2">{result.expectedAnswer}</div>
                  <div className="text-sm text-muted-foreground mt-2">{currentWord.definition}</div>
                </div>
              ) : (
                <div className="space-y-6">
                  {!isRetyping ? (<>
                    <div className="flex items-center justify-between">
                      <p className="text-orange-600 font-medium">¡No hay problema!</p>
                      <Button variant="link" className="text-primary" onClick={handleMarkAsCorrect}>Acerté</Button>
                    </div>
                    {result.userAnswer && (
                      <div className="border-2 border-orange-400 bg-orange-50 rounded-lg p-4">
                        <X className="w-5 h-5 text-orange-600 inline mr-2" />
                        <span className="text-lg">{result.userAnswer}</span>
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium mb-2">Respuesta correcta</p>
                      <div className="border-2 border-green-600 border-dashed bg-green-50 rounded-lg p-4 flex items-center justify-between">
                        <span className="text-lg font-medium">{result.expectedAnswer}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => speak(result.expectedAnswer)}>
                          <Volume2 className="w-5 h-5" />
                        </Button>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">{currentWord.definition}</p>
                    </div>
                    <p className="text-sm text-muted-foreground">Pulsa Enter para volver a escribirla</p>
                  </>) : (<>
                    <div>
                      <p className="text-sm font-medium mb-2">Respuesta correcta</p>
                      <div className="border-2 border-green-600 border-dashed bg-green-50 rounded-lg p-4 flex items-center justify-between">
                        <span className="text-lg font-medium">{result.expectedAnswer}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={() => speak(result.expectedAnswer)}>
                          <Volume2 className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm font-medium">Vuelve a escribirla</p>
                    <div className="flex gap-1 flex-wrap">
                      {FRENCH_CHARS.map(c => <Button key={c} type="button" variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => insertChar(c)}>{c}</Button>)}
                    </div>
                    <form onSubmit={handleRetypeSubmit} className="space-y-4">
                      <Input ref={inputRef} value={retypeAnswer} onChange={(e) => setRetypeAnswer(e.target.value)} placeholder="Escribe" autoFocus required className="text-lg py-6" />
                      <Button type="submit" size="lg" className="w-full">Comprobar</Button>
                    </form>
                  </>)}
                </div>
              )}
            </>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}

function DictHeader({ navigate, learned, total }: { navigate: (n: number) => void; learned: number; total: number }) {
  const pct = total > 0 ? (learned / total) * 100 : 0;
  return (<>
    <div className="border-b border-border bg-background/95 backdrop-blur">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2"><Headphones className="w-5 h-5 text-primary" /><span className="text-lg font-semibold">Dictado</span></div>
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><X className="w-5 h-5" /></Button>
      </div>
    </div>
    <div className="max-w-5xl mx-auto px-6 py-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-3 bg-secondary rounded-full overflow-hidden"><div className="h-full bg-green-500 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div>
        <span className="text-sm font-medium text-muted-foreground">{learned}/{total}</span>
      </div>
    </div>
  </>);
}
