import { useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, FileText, ClipboardPaste, Pencil, ChevronDown, ChevronRight } from 'lucide-react';
import { essaysApi, wordsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import { extractErrorsFromHtml, type DetectedError } from '../utils/errorClassifier';
import type { Essay, Word } from '../types';

interface RedSpan { word: string; start: number; end: number }

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  accent: { label: 'Acento', color: 'bg-purple-100 text-purple-700' },
  spelling: { label: 'Ortografía', color: 'bg-red-100 text-red-700' },
  vocabulary: { label: 'Vocabulario', color: 'bg-blue-100 text-blue-700' },
  preposition: { label: 'Preposición', color: 'bg-amber-100 text-amber-700' },
  conjugation: { label: 'Conjugación', color: 'bg-green-100 text-green-700' },
  expression: { label: 'Expresión', color: 'bg-teal-100 text-teal-700' },
  article: { label: 'Artículo', color: 'bg-orange-100 text-orange-700' },
};

function CategoryBadge({ category }: { category: string }) {
  const info = CATEGORY_LABELS[category] || { label: category, color: 'bg-gray-100 text-gray-700' };
  return <Badge variant="secondary" className={`text-xs ${info.color}`}>{info.label}</Badge>;
}

function InlineText({ text, spans }: { text: string; spans: RedSpan[] }) {
  if (!spans || spans.length === 0) return <p className="whitespace-pre-wrap">{text}</p>;

  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const filtered: RedSpan[] = [];
  for (const s of sorted) {
    if (filtered.length === 0 || s.start >= filtered[filtered.length - 1].end) filtered.push(s);
  }

  const result: React.ReactNode[] = [];
  let last = 0;
  for (const s of filtered) {
    const start = Math.min(s.start, text.length);
    const end = Math.min(s.end, text.length);
    if (start >= end || start < last) continue;
    if (start > last) result.push(<span key={`t-${last}`}>{text.slice(last, start)}</span>);
    result.push(
      <span key={`c-${start}`} className="text-red-500 font-medium bg-red-50 px-0.5 rounded">{text.slice(start, end)}</span>
    );
    last = end;
  }
  if (last < text.length) result.push(<span key="end">{text.slice(last)}</span>);
  return <p className="whitespace-pre-wrap leading-relaxed">{result}</p>;
}

function ErrorsStatsTable({ errorWords, onDelete }: { errorWords: Word[]; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Group by term
  const grouped = errorWords.reduce((acc, w) => {
    if (!acc[w.term]) acc[w.term] = [];
    acc[w.term].push(w);
    return acc;
  }, {} as Record<string, Word[]>);

  // For each unique term, aggregate
  const entries = Object.entries(grouped).map(([term, words]) => {
    const main = words[0];
    return {
      term,
      occurrences: main.occurrences,
      attempts: main.attempts,
      correctCount: main.correctCount,
      successRate: main.successRate,
      id: main.id,
    };
  }).sort((a, b) => a.successRate - b.successRate || b.occurrences - a.occurrences);

  const toggle = (term: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(term) ? next.delete(term) : next.add(term);
      return next;
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8"></TableHead>
          <TableHead>Palabra / Expresión</TableHead>
          <TableHead className="text-center">Apariciones</TableHead>
          <TableHead className="text-center">Intentos</TableHead>
          <TableHead className="text-center">Aciertos</TableHead>
          <TableHead className="text-center">% Éxito</TableHead>
          <TableHead className="w-10"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <>
            <TableRow key={entry.id} className="cursor-pointer hover:bg-muted/50" onClick={() => toggle(entry.term)}>
              <TableCell>
                {expanded.has(entry.term)
                  ? <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </TableCell>
              <TableCell className="font-medium">{entry.term}</TableCell>
              <TableCell className="text-center"><Badge variant="secondary">{entry.occurrences}</Badge></TableCell>
              <TableCell className="text-center">{entry.attempts}</TableCell>
              <TableCell className="text-center">{entry.correctCount}</TableCell>
              <TableCell className="text-center">
                {entry.attempts > 0 ? (
                  <span className={entry.successRate >= 70 ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                    {Math.round(entry.successRate)}%
                  </span>
                ) : <span className="text-muted-foreground">-</span>}
              </TableCell>
              <TableCell>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`¿Eliminar "${entry.term}" de los errores?`)) {
                      onDelete(entry.id);
                    }
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                </Button>
              </TableCell>
            </TableRow>
            {expanded.has(entry.term) && (
              <TableRow key={`${entry.id}-detail`}>
                <TableCell colSpan={6} className="bg-muted/30 py-2 px-8">
                  <p className="text-sm text-muted-foreground">
                    Aparece {entry.occurrences} vez{entry.occurrences !== 1 ? 'es' : ''} en redacciones.
                    {entry.attempts > 0
                      ? ` Entrenada ${entry.attempts} vez${entry.attempts !== 1 ? 'es' : ''} con ${entry.correctCount} acierto${entry.correctCount !== 1 ? 's' : ''}.`
                      : ' No entrenada todavía.'}
                  </p>
                </TableCell>
              </TableRow>
            )}
          </>
        ))}
      </TableBody>
    </Table>
  );
}

export default function EssaysPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingEssayId, setEditingEssayId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [detectedErrors, setDetectedErrors] = useState<DetectedError[]>([]);
  const [hasPasted, setHasPasted] = useState(false);
  const pasteRef = useRef<HTMLDivElement>(null);
  const [showGuidelines, setShowGuidelines] = useState(false);

  const { data: essays, isLoading } = useQuery({
    queryKey: ['essays', languageId],
    queryFn: () => essaysApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  const { data: errorWords } = useQuery({
    queryKey: ['error-words', languageId],
    queryFn: () => essaysApi.getErrorWords(languageId!),
    enabled: !!languageId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { title?: string; text: string; errors: DetectedError[] }) =>
      essaysApi.createManual(languageId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['essays', languageId] });
      queryClient.invalidateQueries({ queryKey: ['error-words', languageId] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; text: string; errors: DetectedError[] } }) =>
      essaysApi.updateManual(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['essays', languageId] });
      queryClient.invalidateQueries({ queryKey: ['error-words', languageId] });
      resetForm();
    },
  });

  const deleteErrorWordMutation = useMutation({
    mutationFn: wordsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-words', languageId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: essaysApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['essays', languageId] });
      queryClient.invalidateQueries({ queryKey: ['error-words', languageId] });
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingEssayId(null);
    setTitle('');
    setPastedText('');
    setDetectedErrors([]);
    setHasPasted(false);
    if (pasteRef.current) pasteRef.current.innerHTML = '';
  };

  const handleEdit = (essay: Essay) => {
    setEditingEssayId(essay.id);
    setTitle(essay.title || '');
    setPastedText(essay.originalText);
    setDetectedErrors([]);
    setHasPasted(true);
    setShowForm(true);
    setTimeout(() => {
      if (pasteRef.current) pasteRef.current.innerText = essay.originalText;
    }, 50);
  };

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    const plainText = e.clipboardData.getData('text/plain');

    setPastedText(plainText);
    setHasPasted(true);

    if (html) {
      const errors = extractErrorsFromHtml(html, plainText);
      setDetectedErrors(errors);
    }
  }, []);

  const handleSave = () => {
    const data = {
      title: title || undefined,
      text: pastedText,
      errors: detectedErrors,
    };
    if (editingEssayId) {
      updateMutation.mutate({ id: editingEssayId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Cargando...</div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/languages/${languageId}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Redacciones</h1>
            <p className="text-muted-foreground mt-1">Pega tus redacciones corregidas para entrenar errores</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowGuidelines(!showGuidelines)}>
            {showGuidelines ? 'Ocultar guía' : 'Guía de marcado'}
          </Button>
          <Button onClick={() => { showForm ? resetForm() : setShowForm(true); }} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            {showForm ? 'Cancelar' : 'Nueva Redacción'}
          </Button>
        </div>
      </div>

      {/* Guidelines */}
      {showGuidelines && (
        <div className="max-w-6xl mx-auto mb-8">
          <Card>
            <CardHeader><h2 className="text-lg font-semibold">Guía de marcado de errores</h2></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>Marca en <span className="text-red-500 font-medium">rojo</span> las correcciones en tu texto. La app clasifica automáticamente cada error:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="accent" />
                  <div>
                    <p className="font-medium">Acento — marca la letra con acento</p>
                    <p className="text-muted-foreground">Ej: "d<span className="text-red-500">é</span>partements", "<span className="text-red-500">é</span>viter", "vid<span className="text-red-500">é</span>o"</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="spelling" />
                  <div>
                    <p className="font-medium">Ortografía — marca las letras incorrectas</p>
                    <p className="text-muted-foreground">Ej: "tranqui<span className="text-red-500">lle</span>" (doble L), "a<span className="text-red-500">tt</span>aques"</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="preposition" />
                  <div>
                    <p className="font-medium">Preposición — marca la preposición correcta</p>
                    <p className="text-muted-foreground">Ej: "appeler <span className="text-red-500">à</span>", "penser <span className="text-red-500">à</span>", "jouer <span className="text-red-500">de</span>"</p>
                    <p className="text-muted-foreground">Se guarda "verbo + preposición" como unidad</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="article" />
                  <div>
                    <p className="font-medium">Artículo — marca el artículo correcto</p>
                    <p className="text-muted-foreground">Ej: "<span className="text-red-500">d'</span>économiser", "<span className="text-red-500">de</span> stress"</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="conjugation" />
                  <div>
                    <p className="font-medium">Conjugación — marca el verbo conjugado</p>
                    <p className="text-muted-foreground">Ej: "je <span className="text-red-500">voyais</span>", "<span className="text-red-500">dépenser</span>"</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="expression" />
                  <div>
                    <p className="font-medium">Expresión — marca la frase completa</p>
                    <p className="text-muted-foreground">Ej: "<span className="text-red-500">Je m'attendais à</span>", "<span className="text-red-500">relations internationales</span>"</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 border rounded-lg">
                  <CategoryBadge category="vocabulary" />
                  <div>
                    <p className="font-medium">Vocabulario — marca la palabra entera</p>
                    <p className="text-muted-foreground">Ej: "<span className="text-red-500">probablement</span>", "<span className="text-red-500">occidental</span>", "<span className="text-red-500">paix</span>"</p>
                  </div>
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800">Solo marca en rojo la parte corregida. La app detecta automáticamente la palabra completa y el tipo de error.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* New/Edit Essay Form */}
      {showForm && (
        <div className="max-w-6xl mx-auto mb-8">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">{editingEssayId ? 'Editar redacción' : 'Pega tu redacción corregida'}</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Título (opcional)</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Mi redacción" />
              </div>
              <div className="space-y-2">
                <Label>Texto</Label>
                <p className="text-xs text-muted-foreground">
                  Pega desde Google Docs/Word. Las correcciones en <span className="text-red-500 font-medium">rojo</span> se detectan y clasifican automáticamente.
                </p>
                <div
                  ref={pasteRef}
                  contentEditable
                  onPaste={handlePaste}
                  className="min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 whitespace-pre-wrap overflow-auto"
                />
              </div>

              {hasPasted && detectedErrors.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <p className="text-sm text-blue-800 font-medium">{detectedErrors.length} error{detectedErrors.length !== 1 ? 'es' : ''} detectado{detectedErrors.length !== 1 ? 's' : ''}:</p>
                  <div className="flex flex-wrap gap-2">
                    {detectedErrors.map((e, i) => (
                      <span key={i} className="inline-flex items-center gap-1">
                        <CategoryBadge category={e.category} />
                        <span className="text-sm font-medium">{e.fullWord}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {hasPasted && detectedErrors.length === 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-sm text-amber-800">No se detectaron palabras en rojo. Pega con Cmd+V desde Google Docs o Word.</p>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={!hasPasted || !pastedText.trim() || isPending}>
                  {isPending ? 'Guardando...' : editingEssayId ? 'Actualizar' : 'Guardar'}
                </Button>
                {editingEssayId && <Button variant="outline" onClick={resetForm}>Cancelar</Button>}
                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                  <ClipboardPaste className="w-4 h-4" /> Cmd+V para pegar con formato
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Error Words Stats Table */}
      {errorWords && errorWords.length > 0 && (
        <div className="max-w-6xl mx-auto mb-8">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Errores de redacción ({errorWords.length})</h2>
                  <p className="text-sm text-muted-foreground">Palabras recogidas de tus redacciones. Haz clic para ver detalles.</p>
                </div>
                <Button onClick={() => navigate(`/languages/${languageId}/error-training`)} size="sm">
                  Entrenar errores
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ErrorsStatsTable errorWords={errorWords} onDelete={(id) => deleteErrorWordMutation.mutate(id)} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Essays List */}
      <div className="max-w-6xl mx-auto space-y-6">
        {essays?.map((essay) => {
          const correction = essay.corrections?.[0];
          const errors = correction?.errors || [];

          let savedSpans: RedSpan[] = [];
          if (correction?.feedback) {
            try { savedSpans = JSON.parse(correction.feedback); } catch {}
          }

          return (
            <Card key={essay.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-lg font-bold">{essay.title || 'Sin título'}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(essay.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {errors.length > 0 && (
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                        {errors.length} error{errors.length !== 1 ? 'es' : ''}
                      </Badge>
                    )}
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => handleEdit(essay)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => {
                      if (window.confirm('¿Eliminar esta redacción?')) deleteMutation.mutate(essay.id);
                    }}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-muted/30 rounded-lg text-base leading-relaxed">
                  <InlineText text={essay.originalText} spans={savedSpans} />
                </div>

                {errors.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {errors.map((error) => (
                      <span key={error.id} className="inline-flex items-center gap-1">
                        <CategoryBadge category={error.errorType} />
                        <span className="text-sm">{error.corrected}</span>
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {essays?.length === 0 && !showForm && (
          <Card className="text-center">
            <CardContent className="py-12">
              <div className="flex flex-col items-center">
                <div className="bg-secondary p-4 rounded-full mb-4">
                  <FileText className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">No hay redacciones</h3>
                <p className="text-muted-foreground mb-4">Pega tus redacciones con correcciones en rojo</p>
                <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Nueva Redacción
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
