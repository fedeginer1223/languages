import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Plus, Dumbbell, Trash2, Pencil, X, Sparkles, Loader2, RefreshCw, Check, Languages,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Card, CardContent } from '../components/ui/card';
import { DataTable } from '../components/ui/data-table/DataTable';
import type { DataTableColumn } from '../components/ui/data-table/types';
import { structuresApi, type Structure, type TranslationExampleDraft } from '../services/api';

const CATEGORIES = [
  { value: 'uncertainty', label: 'Incertidumbre', color: 'bg-amber-100 text-amber-900', guide: 'Expresas duda, posibilidad o probabilidad. Ej: "He may not be able to ___", "I\'m not sure how ___".' },
  { value: 'opinion', label: 'Opinión', color: 'bg-blue-100 text-blue-900', guide: 'Introduces tu punto de vista o valoración.' },
  { value: 'clarification', label: 'Aclaración', color: 'bg-purple-100 text-purple-900', guide: 'Reformulas o explicas algo que dijiste antes.' },
  { value: 'time-buying', label: 'Ganar tiempo', color: 'bg-emerald-100 text-emerald-900', guide: 'Frases-puente para pensar antes de responder.' },
  { value: 'connector', label: 'Conector / Narrativo', color: 'bg-slate-100 text-slate-900', guide: 'Conectas ideas, secuencias o partes de un relato.' },
  { value: 'agreement', label: 'Acuerdo / Concesión', color: 'bg-cyan-100 text-cyan-900', guide: 'Aceptas, concedes o respondes a una postura.' },
  { value: 'grammar', label: 'Gramática', color: 'bg-rose-100 text-rose-900', guide: 'Estructuras gramaticales fijas que cuesta producir bajo presión.' },
  { value: 'idiom', label: 'Expresión / Idiom', color: 'bg-indigo-100 text-indigo-900', guide: 'Frases hechas o expresiones cuya forma es fija.' },
  { value: 'other', label: 'Otra', color: 'bg-gray-100 text-gray-900', guide: 'No encaja en las categorías anteriores.' },
];

function CategoryBadge({ category }: { category: string }) {
  const c = CATEGORIES.find((x) => x.value === category) ?? CATEGORIES[CATEGORIES.length - 1];
  return <Badge className={`${c.color} font-normal`} variant="secondary">{c.label}</Badge>;
}

function isFullyMastered(s: Structure): boolean {
  if (s.examples.length === 0) return false;
  return s.examples.every((e) => e.correctCount >= 2);
}

export default function StructuresPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Definition modal state
  const [showForm, setShowForm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [editing, setEditing] = useState<Structure | null>(null);
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState('uncertainty');
  const [exampleCount, setExampleCount] = useState(5);
  const [aiSeed, setAiSeed] = useState('');
  const [aiError, setAiError] = useState<string | null>(null);

  // Approval modal state
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalStructureId, setApprovalStructureId] = useState<string | null>(null);
  const [approvalPattern, setApprovalPattern] = useState('');
  const [approvalDrafts, setApprovalDrafts] = useState<TranslationExampleDraft[]>([]);
  const [approvalCount, setApprovalCount] = useState(5);
  const [approvalLoading, setApprovalLoading] = useState(false);
  const [approvalError, setApprovalError] = useState<string | null>(null);

  const { data: structures } = useQuery({
    queryKey: ['structures', languageId],
    queryFn: () => structuresApi.list(languageId!),
    enabled: !!languageId,
  });

  const resetForm = () => {
    setPattern(''); setCategory('uncertainty'); setExampleCount(5);
    setShowForm(false); setEditing(null);
    setAiSeed(''); setAiError(null);
  };

  const openEdit = (s: Structure) => {
    setEditing(s);
    setPattern(s.pattern);
    setCategory(s.category);
    setExampleCount(s.exampleCount ?? 5);
    setShowForm(true);
  };

  const openApprovalForStructure = async (structureId: string, opts?: { autoGenerate?: boolean; count?: number }) => {
    let s = (structures ?? []).find((x) => x.id === structureId);
    if (!s) {
      const fresh = await queryClient.fetchQuery({
        queryKey: ['structures', languageId],
        queryFn: () => structuresApi.list(languageId!),
      });
      s = fresh.find((x) => x.id === structureId);
    }
    if (!s) return;
    setApprovalStructureId(structureId);
    setApprovalPattern(s.pattern);
    const desiredCount = opts?.count ?? s.exampleCount ?? 5;
    setApprovalCount(desiredCount);
    setApprovalError(null);
    const existingDrafts: TranslationExampleDraft[] = s.examples
      .filter((e) => (e.spanish ?? '').trim().length > 0)
      .map((e) => ({ spanish: e.spanish!, target: e.text }));
    setApprovalDrafts(existingDrafts);
    setApprovalOpen(true);
    if (opts?.autoGenerate || existingDrafts.length === 0) {
      await runGenerate(structureId, desiredCount, []);
    }
  };

  const runGenerate = async (structureId: string, count: number, excludeSpanish: string[]) => {
    setApprovalLoading(true);
    setApprovalError(null);
    try {
      const res = await structuresApi.generateExamples(structureId, count, excludeSpanish);
      setApprovalDrafts(res.examples);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'no se pudo generar';
      setApprovalError(msg);
    } finally {
      setApprovalLoading(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await structuresApi.create(languageId!, {
        pattern,
        category,
        examples: [], // examples are populated via the approval flow
      });
      // Set the desired exampleCount on the new structure
      await structuresApi.setExampleCount(created.id, exampleCount);
      return { ...created, exampleCount };
    },
    onSuccess: async (created) => {
      queryClient.invalidateQueries({ queryKey: ['structures', languageId] });
      resetForm();
      // Immediately open approval flow, auto-generating N examples
      await openApprovalForStructure(created.id, { autoGenerate: true, count: exampleCount });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      const updated = await structuresApi.update(editing!.id, { pattern, category });
      if ((editing!.exampleCount ?? 5) !== exampleCount) {
        await structuresApi.setExampleCount(editing!.id, exampleCount);
      }
      return updated;
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['structures', languageId] }); resetForm(); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => structuresApi.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['structures', languageId] }),
  });

  const aiScaffoldMutation = useMutation({
    mutationFn: () =>
      structuresApi.aiScaffold(
        languageId!,
        aiSeed,
        CATEGORIES.map((c) => ({ value: c.value, label: c.label, guide: c.guide }))
      ),
    onSuccess: (data) => {
      setPattern(data.pattern);
      setCategory(data.category);
      setAiError(null);
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : 'no se pudo generar';
      setAiError(msg);
    },
  });

  const confirmApprovalMutation = useMutation({
    mutationFn: async () => {
      if (!approvalStructureId) throw new Error('No structure to save into');
      const cleaned = approvalDrafts
        .map((d) => ({ spanish: d.spanish.trim(), target: d.target.trim() }))
        .filter((d) => d.spanish.length > 0 && d.target.length > 0);
      return structuresApi.replaceExamples(approvalStructureId, cleaned, cleaned.length);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['structures', languageId] });
      setApprovalOpen(false);
      setApprovalStructureId(null);
      setApprovalDrafts([]);
      setApprovalPattern('');
      setApprovalError(null);
    },
    onError: (e: unknown) => {
      setApprovalError(e instanceof Error ? e.message : 'no se pudo guardar');
    },
  });

  const submitDefinition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pattern.trim()) return;
    if (editing) updateMutation.mutate(); else createMutation.mutate();
  };

  const columns: DataTableColumn<Structure>[] = useMemo(() => [
    { accessorKey: 'pattern', header: 'Patrón', enableColumnFilter: true,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium font-mono text-sm">{row.original.pattern}</span>
          {row.original.examples[0] && (
            <span className="text-xs text-muted-foreground mt-0.5 truncate max-w-[400px]">
              ej. "{row.original.examples[0].text}"
            </span>
          )}
        </div>
      ),
      meta: { displayName: 'Patrón' } },
    { accessorKey: 'category', header: 'Categoría', filterFn: 'arrIncludesSome',
      cell: ({ row }) => <CategoryBadge category={row.original.category} />,
      meta: { displayName: 'Categoría', filterOptions: CATEGORIES.map((c) => ({ value: c.value, label: c.label })) } },
    { id: 'srsLevel', header: 'Nivel', enableColumnFilter: false,
      accessorFn: (row) => row.srsLevel,
      cell: ({ row }) => {
        const lvl = row.original.srsLevel;
        if (lvl === 6) return <div className="text-center"><Badge className="bg-green-100 text-green-900" variant="secondary">Aprendida</Badge></div>;
        if (lvl === 0 && !row.original.lastTrainedAt) return <div className="text-center"><Badge variant="outline">Pendiente</Badge></div>;
        return <div className="text-center"><Badge className="bg-amber-100 text-amber-900" variant="secondary">L{lvl}</Badge></div>;
      },
      meta: { align: 'center' as const, displayName: 'Nivel' } },
    { id: 'exampleMastery', header: 'Ejemplos', enableColumnFilter: false,
      accessorFn: (row) => {
        const total = row.examples.length;
        const mastered = row.examples.filter((e) => e.correctCount >= 2).length;
        return total === 0 ? -1 : mastered / total;
      },
      cell: ({ row }) => {
        const total = row.original.examples.length;
        if (total === 0) return <div className="text-center text-muted-foreground text-xs">sin ejemplos</div>;
        const mastered = row.original.examples.filter((e) => e.correctCount >= 2).length;
        const allDone = mastered === total;
        return (
          <div className={`text-center text-sm ${allDone ? 'text-green-700 font-medium' : 'text-muted-foreground'}`}>
            {mastered}/{total}
          </div>
        );
      },
      meta: { align: 'center' as const, displayName: 'Ejemplos' } },
    { id: 'weightedScore', header: 'Dominio', enableColumnFilter: false,
      accessorFn: (row) => row.attempts === 0 ? 999 : row.weightedScore,
      cell: ({ row }) => {
        const s = row.original;
        if (s.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return <div className="text-center"><span className={s.weightedScore >= 75 ? 'text-green-600 font-semibold' : s.weightedScore >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>{Math.round(s.weightedScore)}%</span></div>;
      },
      meta: { align: 'center' as const, displayName: 'Dominio' } },
    { id: 'actions', header: '', enableColumnFilter: false, enableSorting: false,
      cell: ({ row }) => {
        const s = row.original;
        const mastered = isFullyMastered(s);
        return (
          <div className="flex gap-1 justify-end">
            <Button
              variant={mastered ? 'default' : 'outline'}
              size="sm"
              className={mastered ? 'bg-green-600 hover:bg-green-700 text-white' : ''}
              onClick={() => openApprovalForStructure(s.id, { autoGenerate: true, count: s.exampleCount ?? 5 })}
              title={mastered ? 'Todos los ejemplos dominados — regenera para variar' : 'Regenerar ejemplos con IA'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${mastered ? '' : 'text-muted-foreground'}`} />
              <span className="ml-1 text-xs">Regenerar</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openApprovalForStructure(s.id)}
              title="Ver o editar ejemplos"
            >
              <Languages className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
            <Button variant="ghost" size="icon" onClick={() => { if (confirm(`¿Borrar "${s.pattern}"?`)) deleteMutation.mutate(s.id); }}><Trash2 className="w-4 h-4 text-red-600" /></Button>
          </div>
        );
      },
      meta: { align: 'right' as const } },
    { accessorKey: 'createdAt', header: 'Creada', enableColumnFilter: false,
      meta: { displayName: 'Creada' } },
  ], [deleteMutation, structures]);

  const items = structures ?? [];
  const total = items.length;
  const aprendidas = items.filter((s) => s.srsLevel >= 6).length;
  const enCurso = items.filter((s) => s.srsLevel >= 1 && s.srsLevel < 6).length;
  const pendientes = items.filter((s) => s.srsLevel === 0 && !s.lastTrainedAt).length;
  const practiced = items.filter((s) => s.attempts > 0);
  const avgDominio = practiced.length > 0 ? Math.round(practiced.reduce((a, s) => a + s.weightedScore, 0) / practiced.length) : 0;
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const hoy = items.filter((s) =>
    s.srsLevel > 0 && s.srsLevel < 6 && s.nextReviewAt && new Date(s.nextReviewAt) <= todayEnd
  ).length;

  return (
    <div className="p-8">
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(`/languages/${languageId}`)}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Estructuras</h1>
            <p className="text-muted-foreground mt-1">Traduce del español para automatizar la estructura. Cada ejemplo se domina con 2 aciertos.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowGuide(!showGuide)}>
            {showGuide ? 'Ocultar guía' : 'Guía de categorías'}
          </Button>
          <Button variant="outline" size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="w-4 h-4 mr-1" /> Nueva estructura
          </Button>
          <Button size="sm" onClick={() => navigate(`/languages/${languageId}/structure-training`)}>
            <Dumbbell className="w-4 h-4 mr-1" /> Entrenar
          </Button>
        </div>
      </div>

      {/* Definition dialog (create/edit) */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar estructura' : 'Nueva estructura'}</DialogTitle>
            <DialogDescription>
              {editing
                ? 'Cambia el patrón, la categoría o el número de ejemplos. Para regenerar los ejemplos, cierra este diálogo y usa el botón "Regenerar" en la fila.'
                : 'Define el patrón y cuántos ejemplos de traducción quieres. Al confirmar, la IA generará los ejemplos y podrás revisarlos antes de guardar.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitDefinition} className="space-y-4">
            {!editing && (
              <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-3 space-y-2">
                <Label className="flex items-center gap-1.5 text-primary">
                  <Sparkles className="w-3.5 h-3.5" /> Extraer patrón desde un ejemplo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Escribe una frase natural. La IA extrae el patrón abstracto y elige la categoría. Los ejemplos de traducción se generan después.
                </p>
                <div className="flex gap-2">
                  <Input
                    value={aiSeed}
                    onChange={(e) => setAiSeed(e.target.value)}
                    placeholder='Ej: "I let there be no mistakes about this"'
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && aiSeed.trim() && !aiScaffoldMutation.isPending) {
                        e.preventDefault();
                        aiScaffoldMutation.mutate();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    onClick={() => aiScaffoldMutation.mutate()}
                    disabled={!aiSeed.trim() || aiScaffoldMutation.isPending}
                    size="sm"
                  >
                    {aiScaffoldMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Extrayendo…</>
                    ) : (
                      <><Sparkles className="w-4 h-4 mr-1" /> Extraer</>
                    )}
                  </Button>
                </div>
                {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              </div>
            )}
            <div>
              <Label>Patrón</Label>
              <Input value={pattern} onChange={(e) => setPattern(e.target.value)} placeholder='Ej: "He may not be able to ___"' required />
              <p className="text-xs text-muted-foreground mt-1">Usa <code>___</code> para marcar el slot si lo tiene.</p>
            </div>
            <div>
              <Label>Categoría</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                <span className="font-medium">Guía:</span> {CATEGORIES.find((c) => c.value === category)?.guide}
              </p>
            </div>
            <div>
              <Label>Número de ejemplos de traducción</Label>
              <div className="flex items-center gap-4 mt-2">
                <input
                  type="range"
                  min={1}
                  max={20}
                  value={exampleCount}
                  onChange={(e) => setExampleCount(parseInt(e.target.value))}
                  className="flex-1"
                />
                <div className="w-12 text-2xl font-bold text-center">{exampleCount}</div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Cada ejemplo es una frase en español que traducirás usando esta estructura. Se dominan con 2 aciertos.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={resetForm}>Cancelar</Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending || !pattern.trim()}>
                {createMutation.isPending || updateMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> {editing ? 'Guardando…' : 'Creando…'}</>
                ) : (
                  editing ? 'Guardar' : 'Crear y generar ejemplos'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Approval / regenerate dialog */}
      <Dialog open={approvalOpen} onOpenChange={(open) => { if (!open) { setApprovalOpen(false); setApprovalStructureId(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ejemplos de traducción</DialogTitle>
            <DialogDescription>
              <span className="font-mono text-sm">{approvalPattern}</span>
              <br />
              Revisa y edita antes de guardar. Cada ejemplo es un prompt en español + su traducción de referencia.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Label>Número de ejemplos a generar</Label>
                <div className="flex items-center gap-3 mt-1">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    value={approvalCount}
                    onChange={(e) => setApprovalCount(parseInt(e.target.value))}
                    className="flex-1"
                  />
                  <div className="w-10 text-lg font-bold text-center">{approvalCount}</div>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => approvalStructureId && runGenerate(approvalStructureId, approvalCount, approvalDrafts.map((d) => d.spanish))}
                disabled={approvalLoading || !approvalStructureId}
              >
                {approvalLoading ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generando…</>
                ) : (
                  <><Sparkles className="w-4 h-4 mr-1" /> Regenerar todos</>
                )}
              </Button>
            </div>

            {approvalError && (
              <div className="rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-800">{approvalError}</div>
            )}

            {approvalLoading && approvalDrafts.length === 0 && (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Generando ejemplos…
              </div>
            )}

            <div className="space-y-3">
              {approvalDrafts.map((d, i) => (
                <div key={i} className="rounded-md border p-3 space-y-2 relative">
                  <div className="absolute top-2 right-2">
                    <Button variant="ghost" size="icon" onClick={() => setApprovalDrafts(approvalDrafts.filter((_, idx) => idx !== i))}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Español (prompt)</Label>
                    <Input
                      value={d.spanish}
                      onChange={(e) => {
                        const next = [...approvalDrafts];
                        next[i] = { ...next[i], spanish: e.target.value };
                        setApprovalDrafts(next);
                      }}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground uppercase tracking-wider">Traducción de referencia</Label>
                    <Input
                      value={d.target}
                      onChange={(e) => {
                        const next = [...approvalDrafts];
                        next[i] = { ...next[i], target: e.target.value };
                        setApprovalDrafts(next);
                      }}
                      className="mt-1 font-mono text-sm"
                    />
                  </div>
                </div>
              ))}

              {!approvalLoading && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setApprovalDrafts([...approvalDrafts, { spanish: '', target: '' }])}
                >
                  <Plus className="w-3 h-3 mr-1" /> Añadir ejemplo a mano
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setApprovalOpen(false); setApprovalStructureId(null); }}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => confirmApprovalMutation.mutate()}
              disabled={confirmApprovalMutation.isPending || approvalDrafts.filter((d) => d.spanish.trim() && d.target.trim()).length === 0}
            >
              {confirmApprovalMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Guardando…</>
              ) : (
                <><Check className="w-4 h-4 mr-1" /> Confirmar y guardar</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guide */}
      {showGuide && (
        <div className="max-w-7xl mx-auto mb-6">
          <Card>
            <CardContent className="pt-6 pb-6 space-y-3 text-sm">
              <p className="text-muted-foreground">Usa esta guía para decidir en qué categoría meter una estructura nueva.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CATEGORIES.map((c) => (
                  <div key={c.value} className="flex items-start gap-3 p-3 border rounded-lg">
                    <Badge className={`${c.color} font-normal shrink-0`} variant="secondary">{c.label}</Badge>
                    <p className="text-muted-foreground leading-relaxed">{c.guide}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* KPIs */}
      <div className="max-w-7xl mx-auto">
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

        <DataTable
          columns={columns}
          data={items}
          searchPlaceholder="Buscar estructuras..."
          tableId="structures-all"
          pageSize={25}
          defaultSorting={[{ id: 'createdAt', desc: false }]}
        />
      </div>
    </div>
  );
}
