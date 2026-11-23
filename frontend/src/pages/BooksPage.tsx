import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, BookMarked, RefreshCw } from 'lucide-react';
import { booksApi } from '../services/api';
import type { BookSummaryItem } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';

export default function BooksPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<BookSummaryItem | null>(null);
  const [toReprocess, setToReprocess] = useState<BookSummaryItem | null>(null);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [noSource, setNoSource] = useState<Set<string>>(new Set());

  const { data: books, isLoading } = useQuery({
    queryKey: ['books', languageId],
    queryFn: () => booksApi.list(languageId!),
    enabled: !!languageId,
  });

  const upload = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.append('file', file!);
      if (title.trim()) form.append('title', title.trim());
      if (author.trim()) form.append('author', author.trim());
      return booksApi.upload(languageId!, form);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', languageId] });
      setUploadOpen(false);
      setFile(null);
      setTitle('');
      setAuthor('');
      setError(null);
    },
    onError: (e: any) => setError(e?.response?.data?.error || e?.message || 'Error al subir el libro'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => booksApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', languageId] });
      setToDelete(null);
    },
  });

  const reprocess = useMutation({
    mutationFn: (id: string) => booksApi.reprocess(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['books', languageId] });
      queryClient.invalidateQueries({ queryKey: ['book'] });
      queryClient.removeQueries({ queryKey: ['book-page'] });
      setToReprocess(null);
      setReprocessError(null);
    },
    onError: (e: any, id) => {
      if (e?.response?.status === 400) setNoSource((prev) => new Set(prev).add(id));
      setReprocessError(e?.response?.data?.error || e?.message || 'Error al reprocesar');
    },
  });

  const [toRe, setToRe] = useState<BookSummaryItem | null>(null);
  const [reRunning, setReRunning] = useState(false);
  const [reProgress, setReProgress] = useState({ done: 0, total: 0 });
  const [reResult, setReResult] = useState<{ done: number; failed: number } | null>(null);
  const [reError, setReError] = useState<string | null>(null);

  const runReannotate = async (b: BookSummaryItem) => {
    setReRunning(true);
    setReError(null);
    setReResult(null);
    const total = b.annotatedPages;
    let done = 0;
    let failed = 0;
    let after: number | undefined;
    setReProgress({ done: 0, total });
    try {
      for (;;) {
        const r = await booksApi.reannotateRead(b.id, 40, after);
        done += r.done;
        failed += r.failed.length;
        after = r.nextAfterIndex;
        setReProgress({ done: done + failed, total });
        if (r.remaining <= 0 || r.done + r.failed.length === 0) break;
      }
      setReResult({ done, failed });
    } catch (e: any) {
      setReError(e?.response?.data?.error || e?.message || 'Error al re-anotar');
      setReResult({ done, failed });
    } finally {
      setReRunning(false);
      queryClient.invalidateQueries({ queryKey: ['books', languageId] });
      queryClient.removeQueries({ queryKey: ['book-page'] });
    }
  };

  const open = (b: BookSummaryItem) =>
    navigate(`/books/${b.id}/read?page=${b.lastPageIndex}`, { state: { languageId } });

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Libros</h1>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus /> Subir libro
        </Button>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando…</p>}
      {books && books.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <BookMarked className="w-10 h-10 mx-auto mb-3 opacity-50" />
            Aún no hay libros. Sube un PDF o TXT para empezar a leer con glosas.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {books?.map((b) => {
          const pct = b.totalPages > 0 ? Math.min(100, ((b.lastPageIndex + 1) / b.totalPages) * 100) : 0;
          const started = b.lastPageIndex > 0;
          return (
            <Card key={b.id}>
              <CardContent className="p-5 space-y-3">
                <div>
                  <h3 className="font-semibold text-lg leading-tight">{b.title}</h3>
                  {b.author && <p className="text-sm text-muted-foreground">{b.author}</p>}
                </div>
                <p className="text-sm">
                  {b.totalPages} páginas · {b.totalWords} palabras
                </p>
                <div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-violet-500" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {b.lastPageIndex + 1} / {b.totalPages}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anotadas: {b.annotatedPages}/{b.totalPages} · ≈ ${b.estimatedCostUsd.toFixed(2)}
                </p>
                <div className="flex items-center gap-2">
                  <Button className="flex-1" onClick={() => open(b)}>
                    {started ? 'Continuar' : 'Leer'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={noSource.has(b.id)}
                    title={noSource.has(b.id) ? 'Este libro no tiene el archivo original; vuelve a subirlo' : 'Reprocesar'}
                    onClick={() => { setReprocessError(null); setToReprocess(b); }}
                    aria-label="Reprocesar"
                  >
                    <RefreshCw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={b.annotatedPages === 0}
                    title="Re-anotar leídas"
                    aria-label="Re-anotar leídas"
                    onClick={() => { setReResult(null); setReError(null); setToRe(b); }}
                  >
                    <RefreshCw className="text-violet-500" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(b)} aria-label="Eliminar">
                    <Trash2 />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={uploadOpen} onOpenChange={(o) => !upload.isPending && setUploadOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Subir libro</DialogTitle>
            <DialogDescription>PDF con texto o archivo TXT.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="book-file">Archivo</Label>
              <Input
                id="book-file"
                type="file"
                accept=".pdf,.txt"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="book-title">Título (opcional)</Label>
              <Input id="book-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="book-author">Autor (opcional)</Label>
              <Input id="book-author" value={author} onChange={(e) => setAuthor(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={upload.isPending} onClick={() => setUploadOpen(false)}>
              Cancelar
            </Button>
            <Button
              disabled={!file || upload.isPending}
              onClick={() => {
                setError(null);
                upload.mutate();
              }}
            >
              {upload.isPending ? (
                <>
                  <Loader2 className="animate-spin" /> Extrayendo texto…
                </>
              ) : (
                'Subir'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toReprocess} onOpenChange={(o) => !o && !reprocess.isPending && setToReprocess(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reprocesar libro</DialogTitle>
            <DialogDescription>
              Se volverán a generar las páginas; las anotaciones se rehacen al leer (coste) y se pierden marcadores. Las palabras guardadas se conservan en el SRS.
            </DialogDescription>
          </DialogHeader>
          {reprocessError && <p className="text-sm text-red-600">{reprocessError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={reprocess.isPending} onClick={() => setToReprocess(null)}>
              Cancelar
            </Button>
            <Button disabled={reprocess.isPending || (!!toReprocess && noSource.has(toReprocess.id))} onClick={() => toReprocess && reprocess.mutate(toReprocess.id)}>
              {reprocess.isPending ? 'Reprocesando…' : 'Reprocesar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toRe} onOpenChange={(o) => !o && !reRunning && setToRe(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-anotar leídas</DialogTitle>
            <DialogDescription>
              Se volverán a generar las glosas de todas las páginas ya leídas ({toRe?.annotatedPages ?? 0}), en lotes de 40.
              Coste aproximado: ≈ ${((toRe?.annotatedPages ?? 0) * 0.035).toFixed(2)} (0,02–0,05 $ por página). Las palabras guardadas no cambian.
            </DialogDescription>
          </DialogHeader>
          {reRunning && (
            <p className="text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Re-anotando… {reProgress.done}/{reProgress.total}
            </p>
          )}
          {reResult && (
            <p className="text-sm">
              Hecho: {reResult.done} páginas re-anotadas{reResult.failed ? `, ${reResult.failed} con error` : ''}.
            </p>
          )}
          {reError && <p className="text-sm text-red-600">{reError}</p>}
          <DialogFooter>
            <Button variant="outline" disabled={reRunning} onClick={() => setToRe(null)}>
              {reResult ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!reResult && (
              <Button disabled={reRunning} onClick={() => toRe && runReannotate(toRe)}>
                {reRunning ? 'Re-anotando…' : 'Re-anotar'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar libro</DialogTitle>
            <DialogDescription>
              ¿Eliminar "{toDelete?.title}"? Se perderán sus anotaciones y progreso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToDelete(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={remove.isPending} onClick={() => toDelete && remove.mutate(toDelete.id)}>
              {remove.isPending ? 'Eliminando…' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
