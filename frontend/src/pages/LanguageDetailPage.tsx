import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, Trash2, Pencil, Dumbbell, Upload, FileText, Loader2, Check, Copy, ClipboardCheck } from 'lucide-react';
import { useState, useMemo } from 'react';
import { languagesApi, topicsApi, wordsApi, srsApi } from '../services/api';
import { parsePastedText, parseSpreadsheet, type ParsedRow } from '../utils/vocabImportParser';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { DataTable } from '../components/ui/data-table/DataTable';
import type { DataTableColumn } from '../components/ui/data-table/types';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../components/ui/dialog';
import type { Word, Topic } from '../types';

export default function LanguageDetailPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showWordForm, setShowWordForm] = useState(false);
  const [topicFormData, setTopicFormData] = useState({ name: '', description: '' });
  const [wordFormData, setWordFormData] = useState({ term: '', definition: '', topicId: '' });
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editFormData, setEditFormData] = useState({ term: '', definition: '' });
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<Word | null>(null);

  // Bulk import state
  const [showImport, setShowImport] = useState(false);
  const [importTopic, setImportTopic] = useState('');
  const [importText, setImportText] = useState('');
  const [importRows, setImportRows] = useState<ParsedRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ inserted: number; alreadyExisting: number; totalUnique: number; topicName: string; topicCreated: boolean } | null>(null);
  const [promptCopied, setPromptCopied] = useState(false);

  // Queries
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

  const topicIds = topics?.map(t => t.id) || [];
  const { data: allWords, isLoading: loadingWords } = useQuery({
    queryKey: ['all-words', languageId, topicIds],
    queryFn: async () => {
      if (!topicIds.length) return [];
      const arrays = await Promise.all(topicIds.map(id => wordsApi.getByTopicId(id, { limit: 10000 })));
      return arrays.flat();
    },
    enabled: !!languageId && topicIds.length > 0,
  });

  // Mutations
  const createTopicMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) => topicsApi.create(languageId!, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['topics', languageId] }); setShowTopicForm(false); setTopicFormData({ name: '', description: '' }); },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: topicsApi.delete,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['topics', languageId] }); queryClient.invalidateQueries({ queryKey: ['all-words', languageId] }); },
  });

  const createWordMutation = useMutation({
    mutationFn: (data: { term: string; definition: string }) => wordsApi.create(wordFormData.topicId, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['all-words', languageId] });
      queryClient.invalidateQueries({ queryKey: ['topics', languageId] });
      // Show green flash, keep dialog open, clear inputs
      setJustAdded(variables.term);
      setWordFormData(prev => ({ ...prev, term: '', definition: '' }));
      setTimeout(() => setJustAdded(null), 1500);
    },
  });

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { term: string; definition: string } }) => wordsApi.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-words', languageId] }); setEditingWord(null); },
  });

  const deleteWordMutation = useMutation({
    mutationFn: wordsApi.delete,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['all-words', languageId] }); queryClient.invalidateQueries({ queryKey: ['topics', languageId] }); },
  });

  const importVocabMutation = useMutation({
    mutationFn: () => wordsApi.importForLanguage(languageId!, { topicName: importTopic.trim(), words: importRows }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['topics', languageId] });
      queryClient.invalidateQueries({ queryKey: ['all-words', languageId] });
      setImportResult(res);
    },
    onError: (e: unknown) => setImportError(e instanceof Error ? e.message : 'error al importar'),
  });

  const resetImport = () => {
    setShowImport(false);
    setImportTopic(''); setImportText(''); setImportRows([]);
    setImportError(null); setImportResult(null);
  };

  // Autocomplete suggestions for new word term
  const termSuggestions = useMemo(() => {
    const t = wordFormData.term.toLowerCase().trim();
    if (!t || t.length < 2 || !allWords) return [];
    return allWords
      .filter(w => w.term.toLowerCase().includes(t))
      .slice(0, 5);
  }, [wordFormData.term, allWords]);

  // Handlers
  const handleTopicSubmit = (e: React.FormEvent) => { e.preventDefault(); createTopicMutation.mutate(topicFormData); };
  const handleWordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Check for exact or very similar duplicate
    const termLower = wordFormData.term.toLowerCase().trim();
    const duplicate = allWords?.find(w => w.term.toLowerCase().trim() === termLower);
    if (duplicate && !duplicateWarning) {
      setDuplicateWarning(duplicate);
      return;
    }
    setDuplicateWarning(null);
    createWordMutation.mutate({ term: wordFormData.term, definition: wordFormData.definition });
  };
  const handleEditWord = (word: Word) => { setEditingWord(word); setEditFormData({ term: word.term, definition: word.definition }); };
  const handleUpdateWord = (e: React.FormEvent) => { e.preventDefault(); if (editingWord) updateWordMutation.mutate({ id: editingWord.id, data: editFormData }); };

  // Topic stats
  const topicMap = useMemo(() => new Map(topics?.map(t => [t.id, t.name]) || []), [topics]);
  const topicOptions = useMemo(() => topics?.map(t => ({ value: t.id, label: t.name })) || [], [topics]);

  // DataTable columns
  const columns: DataTableColumn<Word>[] = useMemo(() => [
    { accessorKey: 'term', header: 'Término', enableColumnFilter: true,
      cell: ({ row }) => <span className="font-medium">{row.original.term}</span>,
      meta: { displayName: 'Término' } },
    { accessorKey: 'definition', header: 'Definición', enableColumnFilter: true,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.definition}</span>,
      meta: { displayName: 'Definición' } },
    { accessorKey: 'topicId', header: 'Topic', filterFn: 'arrIncludesSome',
      cell: ({ row }) => <Badge variant="secondary">{topicMap.get(row.original.topicId) || '?'}</Badge>,
      meta: { displayName: 'Topic', filterOptions: topicOptions } },
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
    { id: 'createdAt', header: 'Añadida', enableColumnFilter: false,
      accessorFn: (row) => new Date(row.createdAt).getTime(),
      cell: ({ row }) => {
        const d = new Date(row.original.createdAt);
        return <div className="text-center text-xs text-muted-foreground">{d.toLocaleDateString()}</div>;
      },
      meta: { align: 'center' as const, displayName: 'Añadida', defaultHidden: true } },
    { id: 'actions', header: '', enableSorting: false, enableColumnFilter: false,
      cell: ({ row }) => (
        <div className="flex justify-end gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditWord(row.original)}><Pencil className="w-3.5 h-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (window.confirm('¿Eliminar?')) deleteWordMutation.mutate(row.original.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ),
      meta: { align: 'right' as const } },
  ], [topicMap, topicOptions]);

  if (loadingWords && !allWords) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Cargando...</div></div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{language?.name || 'Vocabulario'}</h1>
          <p className="text-muted-foreground mt-1">{allWords?.length || 0} palabras · {topics?.length || 0} topics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTopicForm(!showTopicForm)}>
            {showTopicForm ? 'Cancelar' : <><Plus className="w-4 h-4 mr-1" /> Topic</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowWordForm(!showWordForm); if (!showWordForm && topics?.length) setWordFormData({ ...wordFormData, topicId: topics[0].id }); }}>
            {showWordForm ? 'Cancelar' : <><Plus className="w-4 h-4 mr-1" /> Palabra</>}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setShowImport(true); }}>
            <Upload className="w-4 h-4 mr-1" /> Importar
          </Button>
          <Button size="sm" onClick={() => navigate(`/languages/${languageId}/srs-training?languageId=${languageId}`)}>
            <Dumbbell className="w-4 h-4 mr-1" /> Entrenar
          </Button>
        </div>
      </div>

      {/* Add Word Dialog */}
      <Dialog open={showWordForm} onOpenChange={setShowWordForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Añadir palabra</DialogTitle></DialogHeader>
          {justAdded && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm font-medium animate-in fade-in duration-300">
              ✓ "{justAdded}" añadida
            </div>
          )}
          {duplicateWarning && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-lg text-sm space-y-2">
              <p>Esta palabra ya existe: <strong>{duplicateWarning.term}</strong> — "{duplicateWarning.definition}"</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setDuplicateWarning(null); }}>Cancelar</Button>
                <Button size="sm" onClick={() => { setDuplicateWarning(null); createWordMutation.mutate({ term: wordFormData.term, definition: wordFormData.definition }); }}>Añadir de todas formas</Button>
              </div>
            </div>
          )}
          <form onSubmit={handleWordSubmit} className="space-y-4">
            <div className="space-y-2 relative">
              <Label>Término</Label>
              <Input value={wordFormData.term} onChange={e => { setWordFormData({ ...wordFormData, term: e.target.value }); setDuplicateWarning(null); }} placeholder="ej: bonjour" required autoFocus />
              {termSuggestions.length > 0 && !duplicateWarning && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {termSuggestions.map(w => (
                    <div key={w.id} className="px-3 py-1.5 text-sm hover:bg-muted cursor-pointer flex justify-between" onClick={() => setWordFormData({ ...wordFormData, term: w.term })}>
                      <span><strong>{w.term.slice(0, wordFormData.term.length)}</strong>{w.term.slice(wordFormData.term.length)}</span>
                      <span className="text-muted-foreground text-xs">{w.definition}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Definición</Label>
              <Input value={wordFormData.definition} onChange={e => setWordFormData({ ...wordFormData, definition: e.target.value })} placeholder="ej: hola" required />
            </div>
            <div className="space-y-2">
              <Label>Topic</Label>
              <select value={wordFormData.topicId} onChange={e => setWordFormData({ ...wordFormData, topicId: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" required>
                {topics?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => { setShowWordForm(false); setJustAdded(null); }}>Cerrar</Button>
              <Button type="submit" disabled={createWordMutation.isPending}>{createWordMutation.isPending ? 'Creando...' : 'Añadir'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add Topic Dialog */}
      <Dialog open={showTopicForm} onOpenChange={setShowTopicForm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Añadir topic</DialogTitle></DialogHeader>
          <form onSubmit={handleTopicSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={topicFormData.name} onChange={e => setTopicFormData({ ...topicFormData, name: e.target.value })} placeholder="ej: Viajes" required autoFocus />
            </div>
            <div className="space-y-2">
              <Label>Descripción (opcional)</Label>
              <Input value={topicFormData.description} onChange={e => setTopicFormData({ ...topicFormData, description: e.target.value })} placeholder="ej: Vocabulario de viajes" />
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setShowTopicForm(false)}>Cancelar</Button>
              <Button type="submit" disabled={createTopicMutation.isPending}>{createTopicMutation.isPending ? 'Creando...' : 'Añadir'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* KPIs */}
      {(() => {
        const words = allWords || [];
        const total = words.length;
        const aprendidas = words.filter(w => w.srsLevel >= 6).length;
        const enCurso = words.filter(w => w.srsLevel >= 1 && w.srsLevel < 6).length;
        const pendientes = words.filter(w => w.srsLevel === 0 && !w.lastTrainedAt).length;
        const practiced = words.filter(w => w.attempts > 0);
        const avgDominio = practiced.length > 0 ? Math.round(practiced.reduce((s, w) => s + w.weightedScore, 0) / practiced.length) : 0;
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const hoy = words.filter(w => w.srsLevel > 0 && w.srsLevel < 6 && w.nextReviewAt && new Date(w.nextReviewAt) <= todayEnd).length;
        return (
          <div className="flex gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
              <span className="text-2xl font-bold">{total}</span>
              <span className="text-xs text-muted-foreground">Total</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border rounded-lg border-primary bg-primary/5">
              <span className="text-2xl font-bold text-primary">{hoy}</span>
              <span className="text-xs text-muted-foreground">Hoy</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
              <span className="text-2xl font-bold text-green-600">{aprendidas}</span>
              <span className="text-xs text-muted-foreground">Aprendidas</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
              <span className="text-2xl font-bold text-amber-600">{enCurso}</span>
              <span className="text-xs text-muted-foreground">En curso</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
              <span className="text-2xl font-bold text-blue-600">{pendientes}</span>
              <span className="text-xs text-muted-foreground">Pendientes</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 border rounded-lg">
              <span className={`text-2xl font-bold ${avgDominio >= 75 ? 'text-green-600' : avgDominio >= 50 ? 'text-amber-600' : avgDominio > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>{avgDominio}%</span>
              <span className="text-xs text-muted-foreground">Dominio</span>
            </div>
          </div>
        );
      })()}

      {/* Words DataTable */}
      <DataTable
        columns={columns}
        data={allWords || []}
        searchPlaceholder="Buscar palabras..."
        tableId="vocab-all"
        pageSize={25}
        defaultSorting={[{ id: 'createdAt', desc: false }]}
      />

      {/* Edit Word Dialog */}
      <Dialog open={!!editingWord} onOpenChange={(open) => !open && setEditingWord(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar palabra</DialogTitle></DialogHeader>
          <form onSubmit={handleUpdateWord} className="space-y-4">
            <div><Label>Término</Label><Input value={editFormData.term} onChange={e => setEditFormData({ ...editFormData, term: e.target.value })} required /></div>
            <div><Label>Definición</Label><Input value={editFormData.definition} onChange={e => setEditFormData({ ...editFormData, definition: e.target.value })} required /></div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingWord(null)}>Cancelar</Button>
              <Button type="submit" disabled={updateWordMutation.isPending}>Guardar</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk import Dialog */}
      <Dialog open={showImport} onOpenChange={(o) => { if (!o) resetImport(); }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Importar vocabulario</DialogTitle></DialogHeader>

          {importResult ? (
            <div className="space-y-4">
              <div className="p-4 rounded-md border border-green-300 bg-green-50 text-green-900 space-y-1">
                <div className="flex items-center gap-2 font-medium"><Check className="w-4 h-4" /> Importación completada</div>
                <p className="text-sm">
                  Topic: <strong>{importResult.topicName}</strong>{importResult.topicCreated ? ' (creado)' : ''}
                </p>
                <p className="text-sm">
                  {importResult.inserted} palabras nuevas · {importResult.alreadyExisting} ya existían · {importResult.totalUnique} únicas parseadas.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={resetImport}>Cerrar</Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>Topic</Label>
                <Input
                  value={importTopic}
                  onChange={(e) => setImportTopic(e.target.value)}
                  placeholder="Ej: Jardinería"
                  list="topic-suggestions"
                  className="mt-1"
                />
                <datalist id="topic-suggestions">
                  {(topics ?? []).map((t) => <option key={t.id} value={t.name} />)}
                </datalist>
                <p className="text-xs text-muted-foreground mt-1">Elige uno existente o escribe uno nuevo — se crea automáticamente.</p>
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border rounded-md px-2 py-1.5"
                  onClick={async () => {
                    const langName = language?.name ?? 'el idioma objetivo';
                    const topicHint = importTopic.trim() || '{tema}';
                    const prompt =
`Genera SOLO un CSV con vocabulario de ${langName} sobre "${topicHint}", sin explicaciones ni markdown.

Formato exacto:
- Primera línea (cabecera literal): term,definition
- Una entrada por línea. Sin líneas vacías.
- Columna "term": palabra/expresión en ${langName}. Para los SUSTANTIVOS es OBLIGATORIO anteponer el artículo INDEFINIDO en singular para marcar el género (por ejemplo en francés "un"/"une", en español "un"/"una", en italiano "un"/"una"/"uno", en alemán "ein"/"eine"). Nunca uses el artículo definido (le/la/el/la/der/die/das). Los verbos van en infinitivo, sin artículo. Los adjetivos/adverbios/expresiones van sin artículo.
- Columna "definition": traducción breve al español. Para sustantivos, incluye también el artículo indefinido en español ("un"/"una") para que se conserve el género en la traducción.
- Si un campo contiene coma, envuélvelo entre comillas dobles.
- Sin duplicados, sin numeración, sin columnas extra.

Ejemplos correctos (francés → español):
  une maison,una casa
  un chien,un perro
  manger,comer
  rapidement,rápidamente

Ejemplos INCORRECTOS (NO hacer):
  la maison,la casa      ← usa artículo definido en vez de indefinido
  maison,casa            ← falta el artículo, no se sabe el género
  un manger,un comer     ← verbo con artículo

Genera ~40 entradas (ajústalo si te pido otra cantidad).`;
                    try {
                      await navigator.clipboard.writeText(prompt);
                      setPromptCopied(true);
                      setTimeout(() => setPromptCopied(false), 1800);
                    } catch { /* ignore */ }
                  }}
                  title="Copia una instrucción para pedirle a una IA que genere el CSV en el formato correcto"
                >
                  {promptCopied ? <><ClipboardCheck className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar instrucción para IA</>}
                </button>
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
                    className="hidden"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setImportError(null);
                      try {
                        const rows = await parseSpreadsheet(f);
                        setImportRows(rows);
                        setImportText('');
                      } catch (err) {
                        setImportError(err instanceof Error ? err.message : 'no se pudo leer el fichero');
                      }
                      e.target.value = '';
                    }}
                  />
                  <FileText className="w-4 h-4" /> Subir .xlsx / .csv
                </label>
                <span className="text-xs text-muted-foreground">o pega la tabla abajo</span>
              </div>

              <div>
                <Label>Pegar vocabulario</Label>
                <textarea
                  value={importText}
                  onChange={(e) => {
                    setImportText(e.target.value);
                    if (e.target.value.trim()) {
                      const rows = parsePastedText(e.target.value);
                      setImportRows(rows);
                    } else {
                      setImportRows([]);
                    }
                  }}
                  className="w-full min-h-[180px] mt-1 border rounded-md p-2 text-sm font-mono"
                  placeholder={"Formatos aceptados:\n  · Tabla markdown | término | definición |\n  · Con tabs (copiar de Excel/Sheets)\n  · término, definición\n  · término → definición  |  término - definición"}
                />
              </div>

              {importError && (
                <div className="p-2 rounded-md border border-red-300 bg-red-50 text-sm text-red-800">{importError}</div>
              )}

              {importRows.length > 0 && (
                <div className="border rounded-md">
                  <div className="px-3 py-2 border-b text-sm font-medium bg-muted/40">
                    Vista previa: {importRows.length} entrada{importRows.length === 1 ? '' : 's'}
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y text-sm">
                    {importRows.slice(0, 50).map((r, i) => (
                      <div key={i} className="px-3 py-1.5 flex gap-3">
                        <span className="font-medium min-w-[40%] truncate">{r.term}</span>
                        <span className="text-muted-foreground truncate">{r.definition}</span>
                      </div>
                    ))}
                    {importRows.length > 50 && (
                      <div className="px-3 py-1.5 text-xs text-muted-foreground">… y {importRows.length - 50} más</div>
                    )}
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={resetImport}>Cancelar</Button>
                <Button
                  onClick={() => importVocabMutation.mutate()}
                  disabled={importVocabMutation.isPending || importRows.length === 0 || !importTopic.trim()}
                >
                  {importVocabMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Importando…</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-1" /> Importar {importRows.length}</>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
