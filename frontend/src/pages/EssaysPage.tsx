import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, FileText, ClipboardPaste, Pencil, Dumbbell, BookOpen, Sparkles, Loader2, Check, X, RefreshCw, CheckCircle2, XCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { essaysApi, wordsApi, grammarApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { DataTable } from '../components/ui/data-table/DataTable';
import type { DataTableColumn } from '../components/ui/data-table/types';
import { extractErrorsFromHtml, type DetectedError } from '../utils/errorClassifier';
import type { Essay, Word, GrammarItem } from '../types';

const ESSAY_TYPES: { value: string; label: string }[] = [
  { value: 'libre', label: 'Libre' },
  { value: 'synthese', label: 'Synthèse' },
  { value: 'argumentation', label: 'Argumentation' },
  { value: 'lettre', label: 'Lettre / Courriel' },
  { value: 'journal', label: 'Entrada de diario' },
];

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
  const columns: DataTableColumn<Word>[] = useMemo(() => [
    { accessorKey: 'term', header: 'Término', enableColumnFilter: true,
      cell: ({ row }) => <span className="font-medium">{row.original.term}</span>,
      meta: { displayName: 'Término' } },
    { accessorKey: 'definition', header: 'Definición', enableColumnFilter: true,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.definition}</span>,
      meta: { displayName: 'Definición' } },
    { accessorKey: 'occurrences', header: 'Apariciones', enableColumnFilter: false,
      cell: ({ row }) => <div className="text-center">{row.original.occurrences}</div>,
      meta: { align: 'center' as const, displayName: 'Apariciones' } },
    { accessorKey: 'attempts', header: 'Intentos', enableColumnFilter: false,
      cell: ({ row }) => <div className="text-center">{row.original.attempts}</div>,
      meta: { align: 'center' as const, displayName: 'Intentos' } },
    { accessorKey: 'correctCount', header: 'Aciertos', enableColumnFilter: false,
      cell: ({ row }) => <div className="text-center">{row.original.correctCount}</div>,
      meta: { align: 'center' as const, displayName: 'Aciertos' } },
    { accessorKey: 'successRate', header: '% Éxito', enableColumnFilter: false,
      cell: ({ row }) => {
        const w = row.original;
        if (w.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return <div className="text-center"><span className={w.successRate >= 75 ? 'text-green-600 font-semibold' : w.successRate >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>{Math.round(w.successRate)}%</span></div>;
      },
      meta: { align: 'center' as const, displayName: '% Éxito' } },
    { id: 'weightedScore', header: 'Dominio', enableColumnFilter: false,
      accessorFn: (row) => row.attempts === 0 ? 999 : row.weightedScore,
      cell: ({ row }) => {
        const w = row.original;
        if (w.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return <div className="text-center"><span className={w.weightedScore >= 75 ? 'text-green-600 font-semibold' : w.weightedScore >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>{Math.round(w.weightedScore)}%</span></div>;
      },
      meta: { align: 'center' as const, displayName: 'Dominio' } },
    { id: 'days', header: 'Días', enableColumnFilter: false,
      accessorFn: (row) => row.lastTrainedAt ? Math.floor((Date.now() - new Date(row.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24)) : 9999,
      cell: ({ row }) => {
        const w = row.original;
        if (!w.lastTrainedAt) return <div className="text-center text-muted-foreground">-</div>;
        const days = Math.floor((Date.now() - new Date(w.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24));
        return <div className="text-center text-sm">{days}</div>;
      },
      meta: { align: 'center' as const, displayName: 'Días' } },
    { id: 'actions', header: '', enableSorting: false, enableColumnFilter: false,
      cell: ({ row }) => (
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (window.confirm(`¿Eliminar "${row.original.term}"?`)) onDelete(row.original.id); }}>
          <Trash2 className="w-3.5 h-3.5 text-destructive" />
        </Button>
      ),
      meta: { align: 'right' as const },
    },
  ], [onDelete]);

  return (
    <DataTable
      columns={columns}
      data={errorWords}
      searchPlaceholder="Buscar errores..."
      tableId="essay-errors"
      pageSize={25}
      defaultSorting={[{ id: 'weightedScore', desc: false }]}
    />
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

  // ============== GRAMMAR ==============
  const { data: grammarItems } = useQuery({
    queryKey: ['grammar', languageId],
    queryFn: () => grammarApi.list(languageId!),
    enabled: !!languageId,
  });

  const [showGrammarImport, setShowGrammarImport] = useState(false);
  const [grammarExpanded, setGrammarExpanded] = useState(false);
  const [grammarMarkdown, setGrammarMarkdown] = useState('');
  const [grammarDrafts, setGrammarDrafts] = useState<{ title: string; body: string }[]>([]);

  const extractGrammarMutation = useMutation({
    mutationFn: (markdown: string) => grammarApi.extractFromMarkdown(languageId!, markdown),
    onSuccess: (res) => setGrammarDrafts(res.items),
  });
  const saveGrammarMutation = useMutation({
    mutationFn: (items: { title: string; body: string }[]) => grammarApi.saveImported(languageId!, items),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['grammar', languageId] });
      setShowGrammarImport(false);
      setGrammarMarkdown('');
      setGrammarDrafts([]);
    },
  });
  const deleteGrammarMutation = useMutation({
    mutationFn: (id: string) => grammarApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['grammar', languageId] }),
  });
  const [editingGrammar, setEditingGrammar] = useState<GrammarItem | null>(null);
  const [editingGrammarTitle, setEditingGrammarTitle] = useState('');
  const [editingGrammarBody, setEditingGrammarBody] = useState('');
  const updateGrammarMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title?: string; body?: string } }) => grammarApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['grammar', languageId] }); setEditingGrammar(null); },
  });

  // ============== AI-CORRECTED ESSAY FORM ==============
  const [showAiForm, setShowAiForm] = useState(false);
  const [aiTitle, setAiTitle] = useState('');
  const [aiType, setAiType] = useState('libre');
  const [aiText, setAiText] = useState('');
  const [aiGrammarIds, setAiGrammarIds] = useState<string[]>([]);

  const pickGrammarQuery = useMutation({
    mutationFn: (count: number) => grammarApi.pick(languageId!, count),
    onSuccess: (res) => setAiGrammarIds(res.items.map((i) => i.id)),
  });

  // Auto-pick 3 items when the AI form opens.
  useEffect(() => {
    if (showAiForm && aiGrammarIds.length === 0 && (grammarItems?.length ?? 0) > 0) {
      pickGrammarQuery.mutate(3);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAiForm, grammarItems?.length]);

  const createAiMutation = useMutation({
    mutationFn: () => essaysApi.create(languageId!, {
      title: aiTitle || undefined,
      text: aiText,
      type: aiType,
      grammarItemIds: aiGrammarIds,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['essays', languageId] });
      queryClient.invalidateQueries({ queryKey: ['grammar', languageId] });
      queryClient.invalidateQueries({ queryKey: ['error-words', languageId] });
      setShowAiForm(false);
      setAiTitle(''); setAiType('libre'); setAiText(''); setAiGrammarIds([]);
    },
  });

  const grammarById = useMemo(() => {
    const m = new Map<string, GrammarItem>();
    for (const g of grammarItems ?? []) m.set(g.id, g);
    return m;
  }, [grammarItems]);

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
          <Button variant="outline" size="sm" onClick={() => { showForm ? resetForm() : setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" />
            {showForm ? 'Cancelar' : 'Pegar corregida'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAiForm(true)}>
            <Sparkles className="w-4 h-4 mr-1" /> Escribir con IA
          </Button>
          <Button size="sm" onClick={() => navigate(`/languages/${languageId}/srs-training?mode=errors`)}>
            <Dumbbell className="w-4 h-4 mr-1" /> Entrenar
          </Button>
        </div>
      </div>

      {/* Guidelines */}
      {showGuidelines && (
        <div className="max-w-6xl mx-auto mb-8 space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Ejemplo de redacción marcada</h2>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Así debería verse un texto pegado desde Google Docs / Word. En <span className="text-red-500 font-medium">rojo</span> va solo la versión corregida (la parte que tú habías escrito mal queda fuera). Por cada trozo rojo se guarda una pareja <span className="font-medium">"lo que escribí" → "lo correcto"</span> y se genera un ejercicio de relleno con la frase como contexto.
              </p>

              <div className="p-4 border rounded-lg bg-card leading-relaxed">
                <p>
                  Pendant mes vacances en France, j'ai visité plusieurs d<span className="text-red-500 font-medium">é</span>partements
                  pour <span className="text-red-500 font-medium">éviter</span> les zones touristiques. La région était très
                  tranqui<span className="text-red-500 font-medium">ll</span>e et je pensais souvent <span className="text-red-500 font-medium">à</span> ma famille.
                </p>
                <p className="mt-2">
                  <span className="text-red-500 font-medium">Je m'attendais à</span> trouver beaucoup de monde, mais
                  <span className="text-red-500 font-medium"> probablement</span> à cause de la saison, il y avait peu de
                  visiteurs. J'<span className="text-red-500 font-medium">ai dépensé</span> moins que prévu et j'ai pu
                  <span className="text-red-500 font-medium"> économiser</span>.
                </p>
              </div>

              <div className="space-y-2">
                <p className="font-medium">Lo que se guarda a partir de este texto:</p>
                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Tipo</th>
                        <th className="px-3 py-2 text-left font-medium">Marcado en rojo</th>
                        <th className="px-3 py-2 text-left font-medium">Palabra corregida</th>
                        <th className="px-3 py-2 text-left font-medium">Ejercicio (frase con hueco)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="accent" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">é</span></td>
                        <td className="px-3 py-2 align-top font-mono">départements</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"j'ai visité plusieurs ______"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="conjugation" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">éviter</span></td>
                        <td className="px-3 py-2 align-top font-mono">éviter</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"pour ______ les zones touristiques"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="spelling" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">ll</span></td>
                        <td className="px-3 py-2 align-top font-mono">tranquille</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"La région était très ______"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="preposition" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">à</span></td>
                        <td className="px-3 py-2 align-top font-mono">penser à</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"je pensais souvent ______ ma famille"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="expression" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">Je m'attendais à</span></td>
                        <td className="px-3 py-2 align-top font-mono">Je m'attendais à</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"______ trouver beaucoup de monde"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="vocabulary" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">probablement</span></td>
                        <td className="px-3 py-2 align-top font-mono">probablement</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"mais ______ à cause de la saison"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="conjugation" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">ai dépensé</span></td>
                        <td className="px-3 py-2 align-top font-mono">ai dépensé</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"J'______ moins que prévu"</td>
                      </tr>
                      <tr>
                        <td className="px-3 py-2 align-top"><CategoryBadge category="article" /></td>
                        <td className="px-3 py-2 align-top"><span className="text-red-500">économiser</span></td>
                        <td className="px-3 py-2 align-top font-mono">économiser</td>
                        <td className="px-3 py-2 align-top text-muted-foreground">"j'ai pu ______"</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900">
                <p className="font-medium mb-1">Reglas rápidas:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Solo se marca en rojo la <span className="font-medium">versión correcta</span>, no lo que escribiste mal.</li>
                  <li>Para acentos / dobles letras, marca <span className="font-medium">solo</span> la letra cambiada — la app expande a la palabra entera.</li>
                  <li>Para verbo + preposición o frases hechas, marca la <span className="font-medium">expresión completa</span> como un solo bloque rojo.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

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

      {/* Grammar Pool (collapsible) */}
      <div className="max-w-6xl mx-auto mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setGrammarExpanded((v) => !v)}
                className="flex items-center gap-2 text-left flex-1 hover:opacity-80"
                aria-expanded={grammarExpanded}
              >
                {grammarExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <BookOpen className="w-5 h-5" /> Gramática ({grammarItems?.length ?? 0})
                  </h2>
                  {grammarExpanded && (
                    <p className="text-sm text-muted-foreground mt-1">
                      Pool de reglas para practicar en tus redacciones. Al escribir una nueva se te sugieren 3 ítems.
                    </p>
                  )}
                </div>
              </button>
              <Button variant="outline" size="sm" onClick={() => setShowGrammarImport(true)}>
                <Sparkles className="w-4 h-4 mr-1" /> Importar del markdown
              </Button>
            </div>
          </CardHeader>
          {grammarExpanded && grammarItems && grammarItems.length > 0 && (
            <CardContent>
              <GrammarTable
                items={grammarItems}
                onEdit={(it) => { setEditingGrammar(it); setEditingGrammarTitle(it.title); setEditingGrammarBody(it.body); }}
                onDelete={(id) => { if (window.confirm('¿Eliminar este ítem?')) deleteGrammarMutation.mutate(id); }}
              />
            </CardContent>
          )}
        </Card>
      </div>

      {/* Grammar import dialog */}
      <Dialog open={showGrammarImport} onOpenChange={(o) => { if (!o) { setShowGrammarImport(false); setGrammarDrafts([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar gramática desde markdown</DialogTitle>
            <DialogDescription>
              Pega el markdown de tu Notion. La IA extrae un ítem por cada ### (o por tema si no hay). Revisa antes de guardar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                <input
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    setGrammarMarkdown(text);
                    // Reset so re-selecting the same file re-triggers onChange
                    e.target.value = '';
                  }}
                />
                <FileText className="w-4 h-4" /> Subir archivo .md
              </label>
              <span className="text-xs text-muted-foreground">o pega el markdown abajo</span>
            </div>
            <textarea
              value={grammarMarkdown}
              onChange={(e) => setGrammarMarkdown(e.target.value)}
              className="w-full min-h-[200px] border rounded-md p-2 text-sm font-mono"
              placeholder="# Gramatica&#10;## Conjugaison&#10;### Present ..."
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => extractGrammarMutation.mutate(grammarMarkdown)}
              disabled={!grammarMarkdown.trim() || extractGrammarMutation.isPending}
            >
              {extractGrammarMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Extrayendo…</>
              ) : (
                <><Sparkles className="w-4 h-4 mr-1" /> Extraer con IA</>
              )}
            </Button>

            {grammarDrafts.length > 0 && (
              <div className="space-y-3 border-t pt-3">
                <p className="text-sm text-muted-foreground">{grammarDrafts.length} ítem(s) propuestos. Edita antes de guardar.</p>
                {grammarDrafts.map((d, i) => (
                  <div key={i} className="rounded-md border p-3 space-y-2 relative">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => setGrammarDrafts(grammarDrafts.filter((_, idx) => idx !== i))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Título</Label>
                      <Input
                        value={d.title}
                        onChange={(e) => {
                          const next = [...grammarDrafts];
                          next[i] = { ...next[i], title: e.target.value };
                          setGrammarDrafts(next);
                        }}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground uppercase tracking-wider">Cuerpo</Label>
                      <textarea
                        value={d.body}
                        onChange={(e) => {
                          const next = [...grammarDrafts];
                          next[i] = { ...next[i], body: e.target.value };
                          setGrammarDrafts(next);
                        }}
                        className="mt-1 w-full min-h-[80px] border rounded-md p-2 text-sm font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowGrammarImport(false); setGrammarDrafts([]); }}>Cancelar</Button>
            <Button
              onClick={() => saveGrammarMutation.mutate(grammarDrafts)}
              disabled={saveGrammarMutation.isPending || grammarDrafts.length === 0}
            >
              {saveGrammarMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Guardando…</>
              ) : (
                <><Check className="w-4 h-4 mr-1" /> Confirmar y guardar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Grammar edit dialog */}
      <Dialog open={!!editingGrammar} onOpenChange={(o) => { if (!o) setEditingGrammar(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar ítem de gramática</DialogTitle></DialogHeader>
          {editingGrammar && (
            <div className="space-y-3">
              <div>
                <Label>Título</Label>
                <Input value={editingGrammarTitle} onChange={(e) => setEditingGrammarTitle(e.target.value)} />
              </div>
              <div>
                <Label>Cuerpo</Label>
                <textarea
                  value={editingGrammarBody}
                  onChange={(e) => setEditingGrammarBody(e.target.value)}
                  className="w-full min-h-[160px] border rounded-md p-2 text-sm font-mono"
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingGrammar(null)}>Cancelar</Button>
            <Button
              onClick={() => editingGrammar && updateGrammarMutation.mutate({ id: editingGrammar.id, data: { title: editingGrammarTitle, body: editingGrammarBody } })}
              disabled={updateGrammarMutation.isPending}
            >Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI-corrected essay form */}
      <Dialog open={showAiForm} onOpenChange={(o) => { if (!o) { setShowAiForm(false); setAiTitle(''); setAiType('libre'); setAiText(''); setAiGrammarIds([]); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva redacción (corregida por IA)</DialogTitle>
            <DialogDescription>
              Elige el tipo, escribe la redacción, y la IA la corrige + evalúa si has usado bien los ítems de gramática solicitados.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Título (opcional)</Label>
                <Input value={aiTitle} onChange={(e) => setAiTitle(e.target.value)} />
              </div>
              <div>
                <Label>Tipo de producción</Label>
                <select
                  value={aiType}
                  onChange={(e) => setAiType(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  {ESSAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <Label>Ítems gramaticales a practicar</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => pickGrammarQuery.mutate(3)}
                  disabled={pickGrammarQuery.isPending || (grammarItems?.length ?? 0) === 0}
                >
                  {pickGrammarQuery.isPending ? (
                    <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Regenerando…</>
                  ) : (
                    <><RefreshCw className="w-3.5 h-3.5 mr-1" /> Regenerar sugerencia</>
                  )}
                </Button>
              </div>
              {(grammarItems?.length ?? 0) === 0 ? (
                <div className="text-xs text-muted-foreground border rounded-md p-3">
                  Pool vacío. Importa gramática con el botón de arriba.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {aiGrammarIds.map((id) => {
                      const item = grammarById.get(id);
                      if (!item) return null;
                      return (
                        <Badge key={id} variant="secondary" className="bg-primary/10 text-foreground gap-1 py-1 px-2">
                          {item.title}
                          <button
                            type="button"
                            onClick={() => setAiGrammarIds(aiGrammarIds.filter((x) => x !== id))}
                            className="hover:text-red-600"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                    {aiGrammarIds.length === 0 && (
                      <span className="text-xs text-muted-foreground">Sin ítems seleccionados</span>
                    )}
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Añadir manualmente…</summary>
                    <div className="mt-2 max-h-40 overflow-y-auto border rounded-md divide-y">
                      {(grammarItems ?? []).filter((g) => !aiGrammarIds.includes(g.id)).map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
                          onClick={() => setAiGrammarIds([...aiGrammarIds, g.id])}
                        >
                          {g.title}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              )}
            </div>

            <div>
              <Label>Texto de la redacción</Label>
              <textarea
                value={aiText}
                onChange={(e) => setAiText(e.target.value)}
                className="w-full min-h-[220px] border rounded-md p-3 text-sm"
                placeholder="Escribe tu redacción aquí…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAiForm(false)}>Cancelar</Button>
            <Button
              onClick={() => createAiMutation.mutate()}
              disabled={createAiMutation.isPending || !aiText.trim()}
            >
              {createAiMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Corrigiendo con IA…</>
              ) : 'Enviar y corregir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Words Stats Table */}
      {errorWords && errorWords.length > 0 && (
        <div className="max-w-6xl mx-auto mb-8">
          <Card>
            <CardHeader>
              <div>
                <h2 className="text-lg font-semibold">Errores de redacción ({errorWords.length})</h2>
                <p className="text-sm text-muted-foreground">Palabras recogidas de tus redacciones. Haz clic para ver detalles.</p>
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

                {(essay.grammarRequests?.length ?? 0) > 0 && (
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4" /> Gramática solicitada
                    </p>
                    <div className="rounded-md border divide-y">
                      {essay.grammarRequests!.map((r) => {
                        const okBoth = r.used && r.correct;
                        const usedBadMark = r.used && !r.correct;
                        return (
                          <div key={r.id} className="p-3 flex items-start gap-3">
                            <div className="mt-0.5">
                              {okBoth ? <CheckCircle2 className="w-5 h-5 text-green-600" />
                                : usedBadMark ? <XCircle className="w-5 h-5 text-amber-600" />
                                : <XCircle className="w-5 h-5 text-red-500" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{r.grammarItem?.title ?? 'Ítem'}</span>
                                <Badge variant="secondary" className={
                                  okBoth ? 'bg-green-100 text-green-900'
                                  : usedBadMark ? 'bg-amber-100 text-amber-900'
                                  : 'bg-red-100 text-red-900'
                                }>
                                  {okBoth ? 'Usado correctamente' : usedBadMark ? 'Usado con error' : 'No usado'}
                                </Badge>
                              </div>
                              {r.snippet && (
                                <div className="text-xs text-muted-foreground mt-1 italic">"{r.snippet}"</div>
                              )}
                              {r.note && (
                                <div className="text-xs text-muted-foreground mt-1">{r.note}</div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
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

/** Minimal inline markdown → JSX: **bold** and *italic*. Everything else stays literal. */
function renderInlineMarkdown(text: string): React.ReactNode {
  const nodes: React.ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={`b${key++}`} className="font-semibold text-foreground">{match[1]}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={`i${key++}`}>{match[2]}</em>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function GrammarTable({
  items,
  onEdit,
  onDelete,
}: {
  items: GrammarItem[];
  onEdit: (it: GrammarItem) => void;
  onDelete: (id: string) => void;
}) {
  const columns: DataTableColumn<GrammarItem>[] = useMemo(() => [
    { accessorKey: 'title', header: 'Ítem', enableColumnFilter: true,
      cell: ({ row }) => (
        <div>
          <div className="font-medium text-sm">{row.original.title}</div>
          <div className="text-xs text-muted-foreground line-clamp-2 max-w-lg mt-0.5">
            {renderInlineMarkdown(row.original.body)}
          </div>
        </div>
      ),
      meta: { displayName: 'Ítem' } },
    { accessorKey: 'attempts', header: 'Intentos', enableColumnFilter: false,
      cell: ({ row }) => <div className="text-center">{row.original.attempts}</div>,
      meta: { align: 'center' as const, displayName: 'Intentos' } },
    { accessorKey: 'successRate', header: '% Éxito', enableColumnFilter: false,
      cell: ({ row }) => {
        const g = row.original;
        if (g.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return <div className="text-center"><span className={g.successRate >= 75 ? 'text-green-600 font-semibold' : g.successRate >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>{Math.round(g.successRate)}%</span></div>;
      },
      meta: { align: 'center' as const, displayName: '% Éxito' } },
    { id: 'weightedScore', header: 'Dominio', enableColumnFilter: false,
      accessorFn: (row) => row.attempts === 0 ? 999 : row.weightedScore,
      cell: ({ row }) => {
        const g = row.original;
        if (g.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return <div className="text-center"><span className={g.weightedScore >= 75 ? 'text-green-600 font-semibold' : g.weightedScore >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>{Math.round(g.weightedScore)}%</span></div>;
      },
      meta: { align: 'center' as const, displayName: 'Dominio' } },
    { id: 'actions', header: '', enableSorting: false, enableColumnFilter: false,
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onEdit(row.original)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onDelete(row.original.id)}>
            <Trash2 className="w-3.5 h-3.5 text-destructive" />
          </Button>
        </div>
      ),
      meta: { align: 'right' as const },
    },
  ], [onEdit, onDelete]);

  return (
    <DataTable
      columns={columns}
      data={items}
      searchPlaceholder="Buscar gramática..."
      tableId="grammar-items"
      pageSize={15}
      defaultSorting={[{ id: 'weightedScore', desc: false }]}
    />
  );
}
