import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, BookText, Loader2, ArrowLeft, X, Bookmark, List, RefreshCw, Highlighter } from 'lucide-react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { booksApi } from '../services/api';
import type { BookAnnotation, BookHighlight, BookPageData } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '../components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import InterlinearText, { CEFR_LEVELS } from '../components/InterlinearText';

const FONT_SIZES = ['text-[19px]', 'text-[21px]', 'text-[24px]'];

interface Settings {
  level: number;
  glosses: boolean;
  font: number;
}
const DEFAULTS: Settings = { level: 3, glosses: true, font: 1 };

function loadSettings(lang: string): Settings {
  try {
    const raw = localStorage.getItem(`book-reader:${lang}`);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULTS;
}

export default function BookReaderPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const startPage = useRef(Math.max(0, parseInt(searchParams.get('page') || '0', 10) || 0)).current;
  const [loadedPages, setLoadedPages] = useState<number[]>([startPage]);
  const [page, setPage] = useState(startPage); // current page (largest visible area)
  const blockEls = useRef(new Map<number, HTMLElement>());
  const visible = useRef(new Map<number, number>());

  const { data: book } = useQuery({
    queryKey: ['book', bookId],
    queryFn: () => booksApi.get(bookId!),
    enabled: !!bookId,
  });
  const languageId: string | undefined =
    book?.languageId ?? (location.state as { languageId?: string } | null)?.languageId;

  const pageQueries = useQueries({
    queries: loadedPages.map((idx) => ({
      queryKey: ['book-page', bookId, idx],
      queryFn: () => booksApi.getPage(bookId!, idx),
      enabled: !!bookId,
      staleTime: Infinity,
      retry: false,
    })),
  });
  const totalPages = pageQueries.find((q) => q.data)?.data?.totalPages ?? book?.totalPages ?? 0;
  const pageData = pageQueries[loadedPages.indexOf(page)]?.data;
  const lastQuerySuccess = pageQueries[pageQueries.length - 1]?.isSuccess ?? false;

  // Settings (per language)
  const [settings, setSettings] = useState<Settings>(() => loadSettings(languageId ?? 'default'));
  const loadedFor = useRef<string>(languageId ?? 'default');
  useEffect(() => {
    const key = languageId ?? 'default';
    if (loadedFor.current !== key) {
      loadedFor.current = key;
      setSettings(loadSettings(key));
    }
  }, [languageId]);
  const updateSettings = (patch: Partial<Settings>) =>
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(`book-reader:${loadedFor.current}`, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });

  // Debounced progress
  useEffect(() => {
    if (!bookId) return;
    const t = setTimeout(() => {
      booksApi.updateProgress(bookId, page).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [bookId, page]);

  // Current page: block with the largest visible area
  const loadedKey = loadedPages.join(',');
  useEffect(() => {
    const vis = visible.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const idx = Number((e.target as HTMLElement).dataset.pageIdx);
          if (e.isIntersecting) vis.set(idx, e.intersectionRect.height);
          else vis.delete(idx);
        }
        let best = -1, bestArea = 0;
        for (const [idx, area] of vis) if (area > bestArea) { best = idx; bestArea = area; }
        if (best >= 0) setPage((prev) => (prev === best ? prev : best));
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    const els = Array.from(blockEls.current.entries());
    for (const [idx, el] of els) {
      if (loadedPages.includes(idx)) io.observe(el);
    }
    return () => { io.disconnect(); vis.clear(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey, pageQueries.map((q) => (q.data ? 1 : 0)).join('')]);

  // Keep URL in sync with the current page
  useEffect(() => {
    setSearchParams({ page: String(page) }, { replace: true });
  }, [page, setSearchParams]);

  // Infinite loading (append) via sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !lastQuerySuccess || !totalPages) return;
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      setLoadedPages((prev) => {
        const last = prev[prev.length - 1];
        return last + 1 < totalPages ? [...prev, last + 1] : prev;
      });
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [loadedKey, lastQuerySuccess, totalPages]);

  const loadPrevious = () =>
    setLoadedPages((prev) => (prev[0] > 0 ? [prev[0] - 1, ...prev] : prev));

  // Saved lemmas (local optimistic set)
  const [savedLemmas, setSavedLemmas] = useState<Set<string>>(new Set());
  useEffect(() => {
    const all = pageQueries.flatMap((q) => q.data?.savedLemmas ?? []);
    if (all.length) {
      setSavedLemmas((prev) => {
        const next = new Set(prev);
        all.forEach((l) => next.add(l));
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageQueries.map((q) => (q.data ? 1 : 0)).join('')]);

  const toggleMutation = useMutation({
    mutationFn: async (a: { lemma: string; gloss: string; def?: string; save: boolean }) =>
      a.save ? booksApi.saveWord(bookId!, { lemma: a.lemma, gloss: a.gloss, def: a.def ?? a.gloss }) : booksApi.unsaveWord(bookId!, a.lemma),
    onError: (_e, a) => {
      setSavedLemmas((prev) => {
        const next = new Set(prev);
        if (a.save) next.delete(a.lemma);
        else next.add(a.lemma);
        return next;
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['book-saved-words', bookId] });
    },
  });

  const toggleWord = useCallback(
    (a: BookAnnotation) => {
      const save = !savedLemmas.has(a.lemma);
      setSavedLemmas((prev) => {
        const next = new Set(prev);
        if (save) next.add(a.lemma);
        else next.delete(a.lemma);
        return next;
      });
      toggleMutation.mutate({ lemma: a.lemma, gloss: a.gloss, def: a.def ?? a.gloss, save });
    },
    [savedLemmas, toggleMutation]
  );

  // Jump: reset loaded pages to [target] and scroll to top
  const goTo = useCallback(
    (p: number) => {
      const max = totalPages > 0 ? totalPages - 1 : p;
      const clamped = Math.max(0, Math.min(max, p));
      visible.current.clear();
      setLoadedPages([clamped]);
      setPage(clamped);
      window.scrollTo(0, 0);
    },
    [totalPages]
  );

  const scrollToPage = useCallback(
    (p: number) => {
      const el = blockEls.current.get(p);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      else goTo(p);
    },
    [goTo]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === 'ArrowLeft' && page > 0) scrollToPage(page - 1);
      else if (e.key === 'ArrowRight' && (totalPages === 0 || page < totalPages - 1)) scrollToPage(page + 1);
      else if ((e.key === 'b' || e.key === 'B') && !e.metaKey && !e.ctrlKey && !e.altKey) toggleBookmarkRef.current(page);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [scrollToPage, page, totalPages]);

  // Bookmarks
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (book?.bookmarks) setBookmarks(new Set(book.bookmarks));
  }, [book]);
  const [indexOpen, setIndexOpen] = useState(false);
  const bookmarkMutation = useMutation({
    mutationFn: (a: { p: number; add: boolean }) =>
      a.add ? booksApi.addBookmark(bookId!, a.p) : booksApi.removeBookmark(bookId!, a.p),
    onError: (_e, a) => {
      setBookmarks((prev) => {
        const next = new Set(prev);
        if (a.add) next.delete(a.p);
        else next.add(a.p);
        return next;
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['book', bookId] });
      queryClient.invalidateQueries({ queryKey: ['book-bookmarks', bookId] });
    },
  });
  const toggleBookmark = useCallback(
    (p: number) => {
      const add = !bookmarks.has(p);
      setBookmarks((prev) => {
        const next = new Set(prev);
        if (add) next.add(p);
        else next.delete(p);
        return next;
      });
      bookmarkMutation.mutate({ p, add });
    },
    [bookmarks, bookmarkMutation]
  );
  const toggleBookmarkRef = useRef(toggleBookmark);
  toggleBookmarkRef.current = toggleBookmark;
  const bookmarksQuery = useQuery({
    queryKey: ['book-bookmarks', bookId],
    queryFn: () => booksApi.bookmarks(bookId!),
    enabled: indexOpen && !!bookId,
  });
  const currentChapter = useMemo(
    () => (book?.chapters ?? []).reduce<{ index: number; title: string } | null>(
      (acc, c) => (c.index <= page && (!acc || c.index > acc.index) ? c : acc), null),
    [book, page]
  );
  useEffect(() => {
    if (!book?.languageId) return;
    try {
      sessionStorage.setItem('activeLanguageId', book.languageId);
      window.dispatchEvent(new Event('active-language-changed'));
    } catch { /* ignore */ }
  }, [book?.languageId]);
  const goFromIndex = (p: number) => {
    goTo(p);
    setIndexOpen(false);
  };

  const [gotoValue, setGotoValue] = useState('');
  const [savedOpen, setSavedOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [reannotateOpen, setReannotateOpen] = useState(false);
  const [reannotated, setReannotated] = useState(false);
  const reannotate = useMutation({
    mutationFn: (p: number) => booksApi.reannotatePage(bookId!, p),
    onSuccess: (result, p) => {
      queryClient.setQueryData(['book-page', bookId, p], result);
      setReannotateOpen(false);
      setReannotated(true);
      setTimeout(() => setReannotated(false), 2000);
    },
  });

  const savedWordsQuery = useQuery({
    queryKey: ['book-saved-words', bookId],
    queryFn: () => booksApi.savedWords(bookId!),
    enabled: !!bookId,
  });
  const savedCount = savedWordsQuery.data?.length ?? 0;

  // Summary range
  const summaryFrom = useMemo(() => {
    const chapterStart = (book?.chapters ?? []).reduce((acc, c) => (c.index <= page && c.index > acc ? c.index : acc), 0);
    return Math.max(chapterStart, page - 9);
  }, [book, page]);
  const summaryQuery = useQuery({
    queryKey: ['book-summary', bookId, summaryFrom, page],
    queryFn: () => booksApi.createSummary(bookId!, summaryFrom, page),
    staleTime: Infinity,
    enabled: summaryOpen && !!bookId,
    retry: false,
  });

  const removeSaved = useMutation({
    mutationFn: (lemma: string) => booksApi.unsaveWord(bookId!, lemma),
    onSuccess: (_d, lemma) => {
      setSavedLemmas((prev) => {
        const next = new Set(prev);
        next.delete(lemma);
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ['book-saved-words', bookId] });
    },
  });

  // Phrase highlights
  const [selBtn, setSelBtn] = useState<{ pageIdx: number; start: number; end: number; x: number; y: number } | null>(null);
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [removeHl, setRemoveHl] = useState<{ id: string; pageIndex: number } | null>(null);
  const tokenOf = (n: Node | null, which: 'start' | 'end'): number | null => {
    let el: Node | null = n;
    while (el && el.nodeType !== 1) el = el.parentNode;
    const found = (el as HTMLElement | null)?.closest('[data-i]') as HTMLElement | null;
    if (!found) return null;
    const grp = which === 'start' ? found.dataset.iStart : found.dataset.iEnd;
    const v = grp ?? found.dataset.i;
    return v === undefined ? null : Number(v);
  };
  useEffect(() => {
    const onUp = (e: MouseEvent) => {
      if (e.shiftKey) return;
      // wait a tick so the browser finalises the selection
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        const sec = (n: Node) => ((n.nodeType === 1 ? (n as HTMLElement) : n.parentElement)?.closest('section[data-page-idx]') as HTMLElement | null);
        const a = sec(range.startContainer), b = sec(range.endContainer);
        if (!a || a !== b) return;
        let s = tokenOf(range.startContainer, 'start');
        let t = tokenOf(range.endContainer, 'end');
        // Selection edges in whitespace/gaps resolve to the container element: fall back to nearest tokens inside the range.
        if (s === null || t === null) {
          const els = Array.from(a.querySelectorAll<HTMLElement>('[data-i]')).filter((x) => range.intersectsNode(x));
          if (!els.length) return;
          if (s === null) s = Number(els[0].dataset.iStart ?? els[0].dataset.i);
          if (t === null) t = Number(els[els.length - 1].dataset.iEnd ?? els[els.length - 1].dataset.i);
        }
        if (s > t) [s, t] = [t, s];
        t = Math.min(t, s + 119);
        const r = range.getBoundingClientRect();
        setSelBtn({ pageIdx: Number(a.dataset.pageIdx), start: s, end: t, x: r.left + r.width / 2, y: r.top });
      }, 0);
    };
    const onDown = (e: MouseEvent) => {
      if ((e.target as HTMLElement | null)?.closest?.('[data-sel-btn]')) return;
      setSelBtn(null);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelBtn(null); };
    document.addEventListener('mouseup', onUp);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, []);

  const updatePageHighlights = (pageIdx: number, fn: (h: NonNullable<BookPageData['highlights']>) => NonNullable<BookPageData['highlights']>) =>
    queryClient.setQueryData<BookPageData>(['book-page', bookId, pageIdx], (old) => (old ? { ...old, highlights: fn(old.highlights ?? []) } : old));

  const createHl = useMutation({
    mutationFn: (a: { pageIdx: number; start: number; end: number }) =>
      booksApi.createHighlight(bookId!, { pageIndex: a.pageIdx, startToken: a.start, endToken: a.end }),
    onMutate: (a) => {
      const tempId = `tmp-${Date.now()}`;
      updatePageHighlights(a.pageIdx, (h) => [...h, { id: tempId, startToken: a.start, endToken: a.end, translation: null }]);
      return { tempId };
    },
    onSuccess: (row: BookHighlight, a, ctx) => {
      updatePageHighlights(a.pageIdx, (h) => h.map((x) => (x.id === ctx?.tempId ? { id: row.id, startToken: row.startToken, endToken: row.endToken, translation: row.translation } : x)));
      queryClient.invalidateQueries({ queryKey: ['book-highlights', bookId] });
      setPhraseSaved(true);
      setTimeout(() => setPhraseSaved(false), 2000);
    },
    onError: (_e, a, ctx) => {
      updatePageHighlights(a.pageIdx, (h) => h.filter((x) => x.id !== ctx?.tempId));
    },
  });
  const saveSelection = () => {
    if (!selBtn) return;
    createHl.mutate({ pageIdx: selBtn.pageIdx, start: selBtn.start, end: selBtn.end });
    window.getSelection()?.removeAllRanges();
    setSelBtn(null);
  };

  const highlightsQuery = useQuery({
    queryKey: ['book-highlights', bookId],
    queryFn: () => booksApi.highlights(bookId!),
    enabled: indexOpen && !!bookId,
  });
  const deleteHl = useMutation({
    mutationFn: (a: { id: string; pageIndex: number }) => booksApi.deleteHighlight(bookId!, a.id),
    onSuccess: (_d, a) => {
      updatePageHighlights(a.pageIndex, (h) => h.filter((x) => x.id !== a.id));
      queryClient.invalidateQueries({ queryKey: ['book-highlights', bookId] });
      setRemoveHl(null);
    },
  });

  const trainHref = languageId ? `/languages/${languageId}/srs-training` : '/languages';
  const backHref = languageId ? `/languages/${languageId}/books` : '/languages';

  return (
    <div className="min-h-screen bg-[#faf8f5] text-stone-900 relative">
      <Dialog open={reannotateOpen} onOpenChange={(o) => !reannotate.isPending && setReannotateOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-anotar página</DialogTitle>
            <DialogDescription>
              Se volverán a generar las glosas de esta página (≈ 0,02–0,05 $). Las palabras guardadas no cambian.
            </DialogDescription>
          </DialogHeader>
          {reannotate.isError && <p className="text-sm text-red-600">Error al re-anotar. Inténtalo de nuevo.</p>}
          <DialogFooter>
            <Button variant="outline" disabled={reannotate.isPending} onClick={() => setReannotateOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={reannotate.isPending} onClick={() => reannotate.mutate(page)}>
              {reannotate.isPending ? 'Re-anotando…' : 'Re-anotar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!removeHl} onOpenChange={(o) => !o && !deleteHl.isPending && setRemoveHl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quitar frase guardada</DialogTitle>
            <DialogDescription>Se eliminará el subrayado y su traducción.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" disabled={deleteHl.isPending} onClick={() => setRemoveHl(null)}>Cancelar</Button>
            <Button disabled={deleteHl.isPending} onClick={() => removeHl && deleteHl.mutate(removeHl)}>
              {deleteHl.isPending ? 'Quitando…' : 'Quitar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {selBtn && (
        <button
          type="button"
          data-sel-btn
          onClick={saveSelection}
          style={{ position: 'fixed', left: selBtn.x, top: Math.max(8, selBtn.y - 44), transform: 'translateX(-50%)' }}
          className="z-50 flex items-center gap-1.5 rounded-full bg-stone-900 px-3 py-1.5 text-xs font-sans font-medium text-white shadow-lg hover:bg-stone-700"
        >
          <Highlighter className="w-3.5 h-3.5" /> Guardar frase
        </button>
      )}
      {(createHl.isPending || phraseSaved) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 rounded-full bg-stone-900 px-4 py-2 text-xs font-sans text-white shadow-lg flex items-center gap-2">
          {createHl.isPending ? (<><Loader2 className="w-3 h-3 animate-spin" /> Traduciendo…</>) : 'Frase guardada'}
        </div>
      )}

      {/* Right rail */}
      <div className="fixed right-0 top-0 h-full w-20 z-30 flex flex-col items-center gap-3 py-4 border-l border-stone-200/70 bg-[#faf8f5] text-stone-500 [&_button:not(:disabled)]:hover:text-stone-900">
        <div className="text-xs font-medium text-stone-500 tabular-nums">
          {page + 1} / {totalPages || '…'}
        </div>
        <div className="flex-1 flex flex-col items-center gap-1 min-h-0">
          <span className="text-[11px] font-semibold text-stone-700">{CEFR_LEVELS[settings.level]}</span>
          <div className="flex flex-col gap-1" title="Mostrar glosas de este nivel o superior" role="group" aria-label="Nivel CEFR">
            {CEFR_LEVELS.map((l, i) => (
              <button
                key={l}
                type="button"
                onClick={() => updateSettings({ level: i })}
                className={`text-[11px] font-medium w-9 h-6 rounded-full ${
                  settings.level === i ? 'bg-stone-800 text-white' : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/60'
                }`}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          title={settings.glosses ? 'Ocultar glosas' : 'Mostrar glosas'}
          onClick={() => updateSettings({ glosses: !settings.glosses })}
        >
          {settings.glosses ? <Eye /> : <EyeOff />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Tamaño de letra"
          onClick={() => updateSettings({ font: (settings.font + 1) % FONT_SIZES.length })}
          className="font-serif font-bold"
        >
          Aa
        </Button>
        <Button variant="ghost" size="icon" title="Marcar página (b)" onClick={() => toggleBookmark(page)}>
          <Bookmark className={bookmarks.has(page) ? 'fill-current text-amber-500' : ''} />
        </Button>
        <Button variant="ghost" size="icon" title="Índice" onClick={() => setIndexOpen(true)}>
          <List />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Re-anotar esta página"
          disabled={reannotate.isPending}
          onClick={() => setReannotateOpen(true)}
        >
          {reannotate.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
        </Button>
        {reannotated && <span className="text-[10px] text-center text-emerald-600 leading-tight">Página re-anotada</span>}
        <Button variant="ghost" size="icon" title="Resumen" onClick={() => setSummaryOpen(true)}>
          <BookText />
        </Button>
        <form
          className="flex flex-col items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(gotoValue, 10);
            if (!isNaN(n)) goTo(n - 1);
            setGotoValue('');
          }}
        >
          <Input
            value={gotoValue}
            onChange={(e) => setGotoValue(e.target.value.replace(/\D/g, ''))}
            placeholder="pág."
            className="h-7 w-14 px-1 text-center text-xs"
          />
          <Button type="submit" size="sm" variant="outline" className="h-6 px-2 text-xs">
            Ir
          </Button>
        </form>
        <Button variant="outline" size="sm" className="gap-1 px-2" onClick={() => setSavedOpen(true)} title="Palabras guardadas">
          <Bookmark className="w-3.5 h-3.5" />
          {savedCount}
        </Button>
      </div>

      {/* Reading column */}
      <div className="pr-20">
        <div className="sticky top-0 z-20 bg-gradient-to-b from-[#faf8f5] via-[#faf8f5]/90 to-transparent">
          <div className="max-w-[66ch] mx-auto px-6 pt-3 pb-5 flex items-center gap-2 text-xs text-stone-400 font-sans">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(backHref)} title="Biblioteca" className="text-stone-500 hover:text-stone-900">
              <ArrowLeft />
            </Button>
            <span className="truncate">
              {book?.title}
              {currentChapter ? ` · ${currentChapter.title}` : ''}
            </span>
          </div>
        </div>

        <div className={`reader-prose max-w-[66ch] mx-auto px-6 pt-4 pb-16 ${FONT_SIZES[settings.font]}`}>
          {loadedPages[0] > 0 && (
            <div className="text-center mb-10 font-sans">
              <Button variant="ghost" size="sm" className="text-stone-500 hover:text-stone-900" onClick={loadPrevious}>
                Cargar páginas anteriores
              </Button>
            </div>
          )}

          {loadedPages.map((idx, qi) => {
            const q = pageQueries[qi];
            const d = q?.data;
            return (
              <div key={idx}>
                <section
                  data-page-idx={idx}
                  ref={(el) => {
                    if (el) blockEls.current.set(idx, el);
                    else blockEls.current.delete(idx);
                  }}
                  className="scroll-mt-16"
                >
                  {q?.isLoading && (
                    <div className="space-y-3 py-6 font-sans">
                      <p className="text-xs text-stone-400 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" /> Anotando página {idx + 1}…
                      </p>
                      {[92, 100, 85].map((w, i) => (
                        <div key={i} className="h-3 rounded bg-stone-200/70 animate-pulse" style={{ width: `${w}%` }} />
                      ))}
                    </div>
                  )}
                  {q?.isError && (
                    <div className="py-6 text-center space-y-2 font-sans text-sm">
                      <p className="text-red-600">No se pudo cargar la página {idx + 1}.</p>
                      <Button size="sm" variant="outline" onClick={() => q.refetch()}>Reintentar</Button>
                    </div>
                  )}
                  {d && (
                    <InterlinearText
                      text={d.text}
                      tokens={d.tokens}
                      annotations={d.annotations}
                      levelIndex={settings.level}
                      glossesVisible={settings.glosses}
                      savedLemmas={savedLemmas}
                      onToggleWord={toggleWord}
                      chapterTitle={d.chapterTitle}
                      highlights={d.highlights}
                      onRemoveHighlight={(id) => setRemoveHl({ id, pageIndex: idx })}
                    />
                  )}
                </section>
                {idx + 1 < totalPages && (
                  <div className="flex items-center gap-4 my-10" aria-hidden>
                    <span className="flex-1 h-px bg-stone-200" />
                    <span className="flex items-center gap-1 text-[11px] tracking-[0.25em] text-stone-400 font-sans">
                      {idx + 2}
                      {bookmarks.has(idx + 1) && <Bookmark className="w-3 h-3 fill-amber-400 text-amber-400" />}
                    </span>
                    <span className="flex-1 h-px bg-stone-200" />
                  </div>
                )}
              </div>
            );
          })}
          <div ref={sentinelRef} className="h-px" />
        </div>
      </div>

      {/* Saved words */}
      <Dialog open={savedOpen} onOpenChange={setSavedOpen}>
        <DialogContent className="max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Palabras guardadas ({savedCount})</DialogTitle>
            <DialogDescription>Palabras de este libro en tu SRS.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {savedWordsQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">Haz clic en una palabra para guardarla.</p>
            )}
            {savedWordsQuery.data?.map((w) => (
              <div key={w.lemma} className="flex items-center gap-2 py-1.5 border-b last:border-0">
                <div className="flex-1 min-w-0 text-sm">
                  <span className="font-medium">{w.term}</span> — <span className="text-muted-foreground">{w.definition}</span>
                </div>
                <Badge variant="secondary">N{w.srsLevel}</Badge>
                <Button variant="ghost" size="icon-sm" onClick={() => removeSaved.mutate(w.lemma)} aria-label="Quitar">
                  <X />
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => navigate(trainHref)}>Entrenar este libro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Index slide-over */}
      <DialogPrimitive.Root open={indexOpen} onOpenChange={setIndexOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed right-0 top-0 z-50 h-full w-[360px] max-w-[90vw] bg-background shadow-2xl overflow-y-auto p-5 focus:outline-none"
          >
            <div className="flex items-center justify-between mb-4">
              <DialogPrimitive.Title className="text-lg font-semibold">Índice</DialogPrimitive.Title>
              <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </DialogPrimitive.Close>
            </div>
            <Tabs defaultValue="chapters">
              <TabsList>
                <TabsTrigger value="chapters">Capítulos</TabsTrigger>
                <TabsTrigger value="bookmarks">Marcadores</TabsTrigger>
                <TabsTrigger value="phrases">Frases</TabsTrigger>
              </TabsList>
              <TabsContent value="chapters" className="mt-3 space-y-1">
                {(book?.chapters?.length ? book.chapters : []).length === 0 && (
                  <>
                    <p className="text-sm text-muted-foreground mb-2">Este libro no tiene capítulos detectados.</p>
                    <button
                      type="button"
                      onClick={() => goFromIndex(0)}
                      className="w-full flex justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                    >
                      <span>Inicio</span>
                      <span className="text-muted-foreground">pág. 1</span>
                    </button>
                  </>
                )}
                {book?.chapters?.map((c) => (
                  <button
                    key={c.index}
                    type="button"
                    onClick={() => goFromIndex(c.index)}
                    className={`w-full flex justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted ${
                      currentChapter?.index === c.index ? 'bg-violet-50 text-violet-700' : ''
                    }`}
                  >
                    <span className="min-w-0">{c.title}</span>
                    <span className="shrink-0 text-muted-foreground">pág. {c.index + 1}</span>
                  </button>
                ))}
              </TabsContent>
              <TabsContent value="bookmarks" className="mt-3 space-y-1">
                {bookmarksQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {bookmarksQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">Aún no has marcado páginas. Pulsa b o el icono de marcador.</p>
                )}
                {bookmarksQuery.data?.map((b) => (
                  <div
                    key={b.pageIndex}
                    className={`flex items-center gap-2 rounded px-3 py-2 hover:bg-muted ${
                      b.pageIndex === page ? 'bg-violet-50 text-violet-700' : ''
                    }`}
                  >
                    <button type="button" onClick={() => goFromIndex(b.pageIndex)} className="flex-1 min-w-0 text-left text-sm">
                      <span className="font-bold">pág. {b.pageIndex + 1}</span>
                      <span className="block truncate italic text-muted-foreground">{b.snippet}</span>
                    </button>
                    <Button variant="ghost" size="icon-sm" aria-label="Quitar marcador" onClick={() => toggleBookmark(b.pageIndex)}>
                      <X />
                    </Button>
                  </div>
                ))}
              </TabsContent>
              <TabsContent value="phrases" className="mt-3 space-y-1">
                {highlightsQuery.isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {highlightsQuery.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">Selecciona un trozo de texto y pulsa “Guardar frase”.</p>
                )}
                {highlightsQuery.data?.map((h) => (
                  <div key={h.id} className="flex items-start gap-2 rounded px-3 py-2 hover:bg-muted">
                    <button type="button" onClick={() => goFromIndex(h.pageIndex)} className="flex-1 min-w-0 text-left text-sm">
                      <span className="block font-serif line-clamp-2">{h.text}</span>
                      {h.translation && <span className="block italic text-muted-foreground">{h.translation}</span>}
                      <span className="block text-xs text-muted-foreground">pág. {h.pageIndex + 1}</span>
                    </button>
                    <Button variant="ghost" size="icon-sm" aria-label="Quitar frase" onClick={() => setRemoveHl({ id: h.id, pageIndex: h.pageIndex })}>
                      <X />
                    </Button>
                  </div>
                ))}
              </TabsContent>
            </Tabs>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {/* Summary bottom sheet */}
      <DialogPrimitive.Root open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-x-0 bottom-0 z-50 h-[70vh] rounded-t-2xl bg-[#faf8f5] shadow-2xl overflow-y-auto px-6 pb-8 pt-4 focus:outline-none"
          >
            <div className="flex items-center justify-between mb-4">
              <DialogPrimitive.Title className="text-sm text-muted-foreground">
                Resumen · páginas {summaryFrom + 1}–{page + 1}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="rounded p-1 text-muted-foreground hover:bg-stone-200" aria-label="Cerrar">
                <X className="w-4 h-4" />
              </DialogPrimitive.Close>
            </div>
          <div className="max-w-3xl mx-auto reader-prose">
            {summaryQuery.isLoading && (
              <div className="flex items-center gap-2 text-stone-600">
                <Loader2 className="w-4 h-4 animate-spin" /> Generando resumen…
              </div>
            )}
            {summaryQuery.isError && (
              <div className="space-y-3">
                <p className="text-red-600">No se pudo generar el resumen.</p>
                <Button onClick={() => summaryQuery.refetch()}>Reintentar</Button>
              </div>
            )}
            {summaryQuery.data && (
              <div className={FONT_SIZES[settings.font]}>
                <InterlinearText
                  text={summaryQuery.data.text}
                  tokens={summaryQuery.data.tokens}
                  annotations={summaryQuery.data.annotations}
                  levelIndex={settings.level}
                  glossesVisible={settings.glosses}
                  savedLemmas={savedLemmas}
                  onToggleWord={toggleWord}
                />
              </div>
            )}
          </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}
