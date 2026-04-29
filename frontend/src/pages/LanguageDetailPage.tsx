import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, BookOpen, Trash2, ArrowLeft, GraduationCap, BarChart3, Search, Pencil, Eye, LayoutGrid, TableIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { languagesApi, topicsApi, wordsApi, verbsApi, essaysApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import type { Word, Verb } from '../types';

// Tiempos verbales disponibles (por ahora hardcodeado, en el futuro vendrá de la API de conjugación)
const FRENCH_TENSES = [
  // Indicatif
  { id: 'indicatif_présent', label: 'Présent', mood: 'Indicatif' },
  { id: 'indicatif_passé_simple', label: 'Passé simple', mood: 'Indicatif' },
  { id: 'indicatif_passé_composé', label: 'Passé composé', mood: 'Indicatif' },
  { id: 'indicatif_futur_proche', label: 'Futur proche', mood: 'Indicatif' },
  { id: 'indicatif_imparfait', label: 'Imparfait', mood: 'Indicatif' },
  { id: 'indicatif_futur_simple', label: 'Futur simple', mood: 'Indicatif' },
  { id: 'indicatif_plus_que_parfait', label: 'Plus-que-parfait', mood: 'Indicatif' },
  { id: 'indicatif_futur_antérieur', label: 'Futur antérieur', mood: 'Indicatif' },

  // Subjonctif
  { id: 'subjonctif_présent', label: 'Présent', mood: 'Subjonctif' },
  { id: 'subjonctif_imparfait', label: 'Imparfait', mood: 'Subjonctif' },
  { id: 'subjonctif_passé', label: 'Passé', mood: 'Subjonctif' },
  { id: 'subjonctif_plus_que_parfait', label: 'Plus-que-parfait', mood: 'Subjonctif' },

  // Conditionnel
  { id: 'conditionnel_présent', label: 'Présent', mood: 'Conditionnel' },
  { id: 'conditionnel_passé', label: 'Passé', mood: 'Conditionnel' },

  // Impératif
  { id: 'impératif_présent', label: 'Présent', mood: 'Impératif' },
  { id: 'impératif_passé', label: 'Passé', mood: 'Impératif' },
];

const ENGLISH_TENSES = [
  { id: 'present_simple', label: 'Present Simple' },
  { id: 'past_simple', label: 'Past Simple' },
  { id: 'present_perfect', label: 'Present Perfect' },
  { id: 'future_simple', label: 'Future Simple' },
  { id: 'present_continuous', label: 'Present Continuous' },
];

export default function LanguageDetailPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [showWordForm, setShowWordForm] = useState(false);
  const [topicFormData, setTopicFormData] = useState({ name: '', description: '' });
  const [wordFormData, setWordFormData] = useState({ term: '', definition: '', topicId: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [termFilter, setTermFilter] = useState('');
  const [defFilter, setDefFilter] = useState('');
  const [vocabView, setVocabView] = useState<'table' | 'topics'>('topics');
  const [topicFilter, setTopicFilter] = useState<string | null>(null);
  const [vocabPage, setVocabPage] = useState(0);
  const [vocabRowsPerPage, setVocabRowsPerPage] = useState(25);
  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editFormData, setEditFormData] = useState({ term: '', definition: '' });

  // Verb management state
  const [showVerbDialog, setShowVerbDialog] = useState(false);
  const [showConjugationsDialog, setShowConjugationsDialog] = useState(false);
  const [viewingVerb, setViewingVerb] = useState<Verb | null>(null);
  const [infinitive, setInfinitive] = useState('');
  const [selectedTenses, setSelectedTenses] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [verbSuggestions, setVerbSuggestions] = useState<string[]>([]);

  const { data: language, isLoading: loadingLanguage } = useQuery({
    queryKey: ['language', languageId],
    queryFn: () => languagesApi.getById(languageId!),
    enabled: !!languageId,
  });

  const { data: topics, isLoading: loadingTopics } = useQuery({
    queryKey: ['topics', languageId],
    queryFn: () => topicsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  const { data: verbs, isLoading: loadingVerbs } = useQuery({
    queryKey: ['verbs', languageId],
    queryFn: () => verbsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  const { data: essays, isLoading: loadingEssays } = useQuery({
    queryKey: ['essays', languageId],
    queryFn: () => essaysApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  // Fetch words for all topics
  const topicIds = topics?.map(t => t.id) || [];
  const wordsQueries = useQuery({
    queryKey: ['all-words', languageId, topicIds],
    queryFn: async () => {
      if (!topicIds.length) return [];
      const allWords = await Promise.all(
        topicIds.map(topicId => wordsApi.getByTopicId(topicId, { limit: 10000 }))
      );
      return allWords.flat();
    },
    enabled: !!languageId && topicIds.length > 0,
  });

  const createTopicMutation = useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      topicsApi.create(languageId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', languageId] });
      setShowTopicForm(false);
      setTopicFormData({ name: '', description: '' });
    },
  });

  const deleteTopicMutation = useMutation({
    mutationFn: topicsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topics', languageId] });
    },
  });

  const createWordMutation = useMutation({
    mutationFn: (data: { term: string; definition: string; topicId: string }) =>
      wordsApi.create(data.topicId, { term: data.term, definition: data.definition }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-words', languageId] });
      setShowWordForm(false);
      setWordFormData({ term: '', definition: '', topicId: '' });
    },
  });

  const deleteWordMutation = useMutation({
    mutationFn: wordsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-words', languageId] });
    },
  });

  const updateWordMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { term: string; definition: string } }) =>
      wordsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-words', languageId] });
      setEditingWord(null);
      setEditFormData({ term: '', definition: '' });
    },
  });

  const createVerbMutation = useMutation({
    mutationFn: (data: { infinitive: string; conjugations: { tense: string; person: string; form: string }[] }) =>
      verbsApi.create(languageId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verbs', languageId] });
      handleCloseVerbDialog();
    },
  });

  const deleteVerbMutation = useMutation({
    mutationFn: verbsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verbs', languageId] });
    },
  });

  const handleTopicSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTopicMutation.mutate(topicFormData);
  };

  const handleWordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createWordMutation.mutate(wordFormData);
  };

  const handleEditWord = (word: Word) => {
    setEditingWord(word);
    setEditFormData({ term: word.term, definition: word.definition });
  };

  const handleUpdateWord = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingWord) return;
    updateWordMutation.mutate({ id: editingWord.id, data: editFormData });
  };

  const handleOpenCreateVerb = () => {
    setInfinitive('');
    setSelectedTenses([]);
    setShowAutocomplete(false);
    setVerbSuggestions([]);
    setShowVerbDialog(true);
  };

  const handleCloseVerbDialog = () => {
    setShowVerbDialog(false);
    setInfinitive('');
    setSelectedTenses([]);
    setShowAutocomplete(false);
    setVerbSuggestions([]);
  };

  const handleInfinitiveChange = async (value: string) => {
    setInfinitive(value);

    if (value.trim().length >= 2) {
      try {
        console.log('Fetching verbs for:', value);
        const response = await fetch(
          `/api/v1/verbs/search?q=${encodeURIComponent(value)}&language=french`
        );

        if (!response.ok) {
          console.error('Failed to fetch verbs:', response.status, response.statusText);
          setShowAutocomplete(false);
          setVerbSuggestions([]);
          return;
        }

        const suggestions = await response.json();
        console.log('Got suggestions:', suggestions);
        setVerbSuggestions(suggestions);
        setShowAutocomplete(suggestions.length > 0);
      } catch (error) {
        console.error('Error fetching verb suggestions:', error);
        setShowAutocomplete(false);
        setVerbSuggestions([]);
      }
    } else {
      setShowAutocomplete(false);
      setVerbSuggestions([]);
    }
  };

  const handleSelectSuggestion = (verb: string) => {
    setInfinitive(verb);
    setShowAutocomplete(false);
    setVerbSuggestions([]);
  };

  const handleSaveVerb = () => {
    if (!infinitive.trim() || selectedTenses.length === 0) {
      return;
    }

    const conjugations: { tense: string; person: string; form: string }[] = [];
    const persons = ['je', 'tu', 'il/elle', 'nous', 'vous', 'ils/elles'];

    selectedTenses.forEach((tense) => {
      persons.forEach((person) => {
        conjugations.push({
          tense,
          person,
          form: '[pendiente]',
        });
      });
    });

    createVerbMutation.mutate({
      infinitive: infinitive.trim(),
      conjugations,
    });
  };

  const handleToggleTense = (tenseId: string) => {
    setSelectedTenses((prev) =>
      prev.includes(tenseId)
        ? prev.filter((t) => t !== tenseId)
        : [...prev, tenseId]
    );
  };

  const handleViewConjugations = (verb: Verb) => {
    setViewingVerb(verb);
    setShowConjugationsDialog(true);
  };

  const availableTenses = FRENCH_TENSES;

  const filteredWords = useMemo(() => {
    if (!wordsQueries.data) return [];
    let words = wordsQueries.data;

    if (topicFilter) {
      words = words.filter(w => w.topicId === topicFilter);
    }
    if (termFilter) {
      const t = termFilter.toLowerCase();
      words = words.filter(w => w.term.toLowerCase().includes(t));
    }
    if (defFilter) {
      const d = defFilter.toLowerCase();
      words = words.filter(w => w.definition.toLowerCase().includes(d));
    }
    if (!searchTerm) return words;

    const search = searchTerm.toLowerCase();
    return words.filter(
      word =>
        word.term.toLowerCase().includes(search) ||
        word.definition.toLowerCase().includes(search)
    );
  }, [wordsQueries.data, searchTerm]);

  if (loadingLanguage || loadingTopics) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!language) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
          Language not found
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/languages')}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{language.name}</h1>
            <p className="text-muted-foreground mt-1">
              {language.stats?.wordsCount || 0} words · {language.stats?.topicsCount || 0} topics
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="default"
              onClick={() => navigate(`/languages/${languageId}/training-sessions`)}
              className="flex items-center gap-2"
            >
              <GraduationCap className="w-4 h-4" />
              Train All
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate(`/languages/${languageId}/stats`)}
              className="flex items-center gap-2"
            >
              <BarChart3 className="w-4 h-4" />
              View Stats
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="vocabulary" className="w-full" onValueChange={(value) => {
        if (value === 'essays') navigate(`/languages/${languageId}/essays`);
      }}>
        <div className="max-w-6xl mx-auto">
          <TabsList>
            <TabsTrigger value="vocabulary">Vocabulario ({wordsQueries.data?.length || 0})</TabsTrigger>
            <TabsTrigger value="verbs">Verbs ({verbs?.length || 0})</TabsTrigger>
            <TabsTrigger value="essays">Essays ({essays?.length || 0})</TabsTrigger>
          </TabsList>
        </div>

        {/* Vocabulary Tab */}
        <TabsContent value="vocabulary" className="space-y-4">
          {/* View toggle + search + actions */}
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <Button
                  variant={vocabView === 'topics' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setVocabView('topics'); setTopicFilter(null); setVocabPage(0); }}
                >
                  <LayoutGrid className="w-4 h-4 mr-1" /> Topics
                </Button>
                <Button
                  variant={vocabView === 'table' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setVocabView('table'); setVocabPage(0); }}
                >
                  <TableIcon className="w-4 h-4 mr-1" /> Tabla
                </Button>
              </div>
              <div className="flex gap-2">
                {vocabView === 'topics' && (
                  <Button onClick={() => setShowTopicForm(!showTopicForm)} variant="outline" size="sm">
                    {showTopicForm ? 'Cancelar' : <><Plus className="w-4 h-4 mr-1" /> Topic</>}
                  </Button>
                )}
                <Button
                  size="sm"
                  onClick={() => {
                    setShowWordForm(!showWordForm);
                    if (!showWordForm && topics && topics.length > 0) {
                      setWordFormData({ ...wordFormData, topicId: topics[0].id });
                    }
                  }}
                >
                  {showWordForm ? 'Cancelar' : <><Plus className="w-4 h-4 mr-1" /> Palabra</>}
                </Button>
              </div>
            </div>
          </div>



          {/* FORMS */}
          {showWordForm && (
            <div className="max-w-6xl mx-auto">
              <Card>
                <CardHeader><h2 className="text-lg font-semibold">Nueva palabra</h2></CardHeader>
                <CardContent>
                  <form onSubmit={handleWordSubmit} className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <Input value={wordFormData.term} onChange={(e) => setWordFormData({ ...wordFormData, term: e.target.value })} placeholder="Término" required />
                      <Input value={wordFormData.definition} onChange={(e) => setWordFormData({ ...wordFormData, definition: e.target.value })} placeholder="Definición" required />
                      <select value={wordFormData.topicId} onChange={(e) => setWordFormData({ ...wordFormData, topicId: e.target.value })} className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" required>
                        {topics?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                    <Button type="submit" size="sm" disabled={createWordMutation.isPending}>
                      {createWordMutation.isPending ? "Creando..." : "Crear"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {showTopicForm && vocabView === "topics" && (
            <div className="max-w-6xl mx-auto">
              <Card>
                <CardHeader><h2 className="text-lg font-semibold">Nuevo topic</h2></CardHeader>
                <CardContent>
                  <form onSubmit={handleTopicSubmit} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <Input value={topicFormData.name} onChange={(e) => setTopicFormData({ ...topicFormData, name: e.target.value })} placeholder="Nombre" required />
                      <Input value={topicFormData.description} onChange={(e) => setTopicFormData({ ...topicFormData, description: e.target.value })} placeholder="Descripción (opcional)" />
                    </div>
                    <Button type="submit" size="sm" disabled={createTopicMutation.isPending}>
                      {createTopicMutation.isPending ? "Creando..." : "Crear"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>
          )}

          {/* TABLE VIEW */}
          {vocabView === "table" && (
            <div className="max-w-6xl mx-auto">
              {(() => {
                const totalPages = Math.ceil(filteredWords.length / vocabRowsPerPage);
                const paged = filteredWords.slice(vocabPage * vocabRowsPerPage, (vocabPage + 1) * vocabRowsPerPage);
                return paged.length > 0 ? (
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="pl-6 font-semibold">Término</TableHead>
                          <TableHead className="font-semibold">Definición</TableHead>
                          <TableHead className="font-semibold">Topic</TableHead>
                          <TableHead className="text-center font-semibold">% Éxito</TableHead>
                          <TableHead className="text-right pr-6 font-semibold">Acciones</TableHead>
                        </TableRow>
                        <TableRow className="bg-muted/30">
                          <TableHead className="pl-6 py-1">
                            <Input
                              placeholder="Filtrar término..."
                              value={termFilter}
                              onChange={(e) => { setTermFilter(e.target.value); setVocabPage(0); }}
                              className="h-7 text-xs"
                            />
                          </TableHead>
                          <TableHead className="py-1">
                            <Input
                              placeholder="Filtrar definición..."
                              value={defFilter}
                              onChange={(e) => { setDefFilter(e.target.value); setVocabPage(0); }}
                              className="h-7 text-xs"
                            />
                          </TableHead>
                          <TableHead className="py-1">
                            <select
                              value={topicFilter || ""}
                              onChange={(e) => { setTopicFilter(e.target.value || null); setVocabPage(0); }}
                              className="h-7 w-full rounded border border-input bg-background px-2 text-xs"
                            >
                              <option value="">Todos</option>
                              {topics?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </TableHead>
                          <TableHead className="py-1" />
                          <TableHead className="py-1" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {paged.map((word: Word) => {
                          const topic = topics?.find(t => t.id === word.topicId);
                          return (
                            <TableRow key={word.id}>
                              <TableCell className="font-medium pl-6">{word.term}</TableCell>
                              <TableCell>{word.definition}</TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="cursor-pointer" onClick={() => { setTopicFilter(word.topicId); setVocabPage(0); }}>
                                  {topic?.name || "?"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                {word.attempts > 0 ? (
                                  <span className={word.successRate >= 75 ? "text-green-600 font-semibold" : word.successRate >= 50 ? "text-amber-600" : "text-red-600 font-semibold"}>
                                    {Math.round(word.successRate)}%
                                  </span>
                                ) : <span className="text-muted-foreground text-sm">-</span>}
                              </TableCell>
                              <TableCell className="text-right pr-6">
                                <div className="flex justify-end gap-1">
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditWord(word)}><Pencil className="w-3.5 h-3.5" /></Button>
                                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (window.confirm("¿Eliminar?")) deleteWordMutation.mutate(word.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                    <div className="flex items-center justify-between px-6 py-3 border-t">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Filas:</span>
                        {[10, 25, 50, 100].map(n => (
                          <Button key={n} variant={vocabRowsPerPage === n ? "default" : "outline"} size="sm" className="h-6 px-2 text-xs" onClick={() => { setVocabRowsPerPage(n); setVocabPage(0); }}>{n}</Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{vocabPage * vocabRowsPerPage + 1}-{Math.min((vocabPage + 1) * vocabRowsPerPage, filteredWords.length)} de {filteredWords.length}</span>
                        <Button variant="outline" size="icon" className="h-6 w-6" disabled={vocabPage === 0} onClick={() => setVocabPage(p => p - 1)}><ChevronLeft className="w-3 h-3" /></Button>
                        <Button variant="outline" size="icon" className="h-6 w-6" disabled={vocabPage >= totalPages - 1} onClick={() => setVocabPage(p => p + 1)}><ChevronRight className="w-3 h-3" /></Button>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <Card className="text-center">
                    <CardContent className="py-12">
                      <p className="text-muted-foreground">{searchTerm || topicFilter ? "No se encontraron palabras" : "No hay palabras todavía"}</p>
                    </CardContent>
                  </Card>
                );
              })()}
            </div>
          )}

          {/* TOPICS VIEW */}
          {vocabView === "topics" && (
            <div className="max-w-6xl mx-auto">
              {topics && topics.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {topics.map((topic) => (
                    <Card
                      key={topic.id}
                      className="hover:border-primary transition-all cursor-pointer group"
                      onClick={() => { setVocabView("table"); setTopicFilter(topic.id); setVocabPage(0); }}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h2 className="text-xl font-bold group-hover:text-primary transition-colors">{topic.name}</h2>
                            {topic.description && <p className="text-sm text-muted-foreground mt-1">{topic.description}</p>}
                          </div>
                          <div className="bg-secondary p-2 rounded-lg"><BookOpen className="w-5 h-5" /></div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="secondary">{topic.wordsCount || 0} palabras</Badge>
                          {topic.avgSuccessRate > 0 && <Badge variant="default">{topic.avgSuccessRate}%</Badge>}
                        </div>
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="destructive" onClick={() => { if (window.confirm('¿Eliminar "' + topic.name + '"?')) deleteTopicMutation.mutate(topic.id); }}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                !showTopicForm && (
                  <Card className="text-center">
                    <CardContent className="py-12">
                      <p className="text-muted-foreground mb-4">No hay topics todavía</p>
                      <Button onClick={() => setShowTopicForm(true)}><Plus className="w-4 h-4 mr-1" /> Crear Topic</Button>
                    </CardContent>
                  </Card>
                )
              )}
            </div>
          )}
        </TabsContent>


        {/* Verbs Tab */}
        <TabsContent value="verbs" className="space-y-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Verbos</h2>
              <p className="text-muted-foreground mt-1">
                Gestiona los verbos para practicar sus conjugaciones
              </p>
            </div>
            <Button onClick={handleOpenCreateVerb} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Añadir Verbo
            </Button>
          </div>

          {verbs && verbs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {verbs.map((verb) => {
                const uniqueTenses = [...new Set(verb.conjugations.map((c) => c.tense))];
                const totalAttempts = verb.conjugations.reduce((sum, c) => sum + c.attempts, 0);
                const totalCorrect = verb.conjugations.reduce((sum, c) => sum + c.correctCount, 0);
                const avgSuccessRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

                return (
                  <Card
                    key={verb.id}
                    className="hover:border-primary transition-all group cursor-pointer"
                    onClick={() => navigate(`/verbs/${verb.id}/training`)}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <h3 className="text-lg font-bold">{verb.infinitive}</h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {uniqueTenses.length} tiempo{uniqueTenses.length !== 1 ? 's' : ''} verbal{uniqueTenses.length !== 1 ? 'es' : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewConjugations(verb);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('¿Eliminar este verbo?')) {
                                deleteVerbMutation.mutate(verb.id);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-4">
                      {totalAttempts > 0 && (
                        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Intentos</p>
                            <p className="text-lg font-bold">{totalAttempts}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-1">Acierto</p>
                            <p className="text-lg font-bold text-green-600">{avgSuccessRate}%</p>
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Tiempos verbales:</p>
                        <div className="flex flex-wrap gap-1">
                          {uniqueTenses.map((tense) => (
                            <Badge key={tense} variant="secondary" className="text-xs">
                              {tense.replace('_', ' ')}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground pt-2 border-t">
                        {verb.conjugations.length} conjugaciones
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="text-center">
              <CardContent className="py-12">
                <div className="flex flex-col items-center">
                  <div className="bg-secondary p-4 rounded-full mb-4">
                    <Pencil className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">No hay verbos todavía</h3>
                  <p className="text-muted-foreground mb-4">
                    Añade tu primer verbo para empezar a practicar conjugaciones
                  </p>
                  <Button onClick={handleOpenCreateVerb} className="flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Añadir Verbo
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Essays Tab is empty — handled by onValueChange redirect above */}
        <TabsContent value="essays" />
      </Tabs>

      {/* Edit Word Dialog */}
      <Dialog open={!!editingWord} onOpenChange={(open) => !open && setEditingWord(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Word</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateWord} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-term">Term</Label>
              <Input
                id="edit-term"
                type="text"
                value={editFormData.term}
                onChange={(e) => setEditFormData({ ...editFormData, term: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-definition">Definition</Label>
              <Input
                id="edit-definition"
                type="text"
                value={editFormData.definition}
                onChange={(e) => setEditFormData({ ...editFormData, definition: e.target.value })}
                required
              />
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingWord(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updateWordMutation.isPending}>
                {updateWordMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Conjugations View Dialog */}
      <Dialog open={showConjugationsDialog} onOpenChange={setShowConjugationsDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Conjugaciones de "{viewingVerb?.infinitive}"
            </DialogTitle>
          </DialogHeader>

          <div className="py-4">
            {viewingVerb && (() => {
              const conjugationsByTense = viewingVerb.conjugations.reduce((acc, conj) => {
                if (!acc[conj.tense]) {
                  acc[conj.tense] = [];
                }
                acc[conj.tense].push(conj);
                return acc;
              }, {} as Record<string, typeof viewingVerb.conjugations>);

              return (
                <div className="space-y-6">
                  {Object.entries(conjugationsByTense).map(([tense, conjugations]) => (
                    <div key={tense} className="space-y-2">
                      <h3 className="text-lg font-semibold capitalize border-b pb-2">
                        {tense.replace(/_/g, ' ')}
                      </h3>
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead className="font-semibold">Persona</TableHead>
                            <TableHead className="font-semibold">Forma</TableHead>
                            <TableHead className="font-semibold text-center">Intentos</TableHead>
                            <TableHead className="font-semibold text-center">Aciertos</TableHead>
                            <TableHead className="font-semibold text-center">% Éxito</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {conjugations.map((conj) => (
                            <TableRow key={conj.id}>
                              <TableCell className="font-medium">{conj.person}</TableCell>
                              <TableCell className="font-mono">{conj.form}</TableCell>
                              <TableCell className="text-center">{conj.attempts}</TableCell>
                              <TableCell className="text-center">{conj.correctCount}</TableCell>
                              <TableCell className="text-center">
                                {conj.attempts > 0 ? (
                                  <span className={conj.successRate >= 70 ? 'text-green-600 font-semibold' : 'text-amber-600'}>
                                    {Math.round(conj.successRate)}%
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConjugationsDialog(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Verb Dialog */}
      <Dialog open={showVerbDialog} onOpenChange={setShowVerbDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Añadir Verbo</DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-2 relative">
              <Label htmlFor="infinitive">Infinitivo</Label>
              <Input
                id="infinitive"
                placeholder="ej: avoir, être, parler..."
                value={infinitive}
                onChange={(e) => handleInfinitiveChange(e.target.value)}
                onFocus={() => {
                  if (infinitive.length >= 2 && verbSuggestions.length > 0) {
                    setShowAutocomplete(true);
                  }
                }}
                autoFocus
              />

              {/* Autocomplete dropdown */}
              {showAutocomplete && verbSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-background border border-border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {verbSuggestions.map((verb, index) => (
                    <div
                      key={verb}
                      className={`px-4 py-2 cursor-pointer hover:bg-primary hover:text-primary-foreground ${
                        index === 0 ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => handleSelectSuggestion(verb)}
                    >
                      {verb}
                    </div>
                  ))}
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Introduce el verbo en infinitivo
              </p>
            </div>

            <div className="space-y-3">
              <Label>Tiempos verbales</Label>
              <p className="text-xs text-muted-foreground">
                Selecciona los tiempos verbales con los que quieres entrenar
              </p>

              <div className="space-y-4 max-h-96 overflow-y-auto p-2 border rounded-lg">
                {/* Group tenses by mood */}
                {['Indicatif', 'Subjonctif', 'Conditionnel', 'Impératif'].map((mood) => {
                  const moodTenses = availableTenses.filter((t) => t.mood === mood);
                  if (moodTenses.length === 0) return null;

                  return (
                    <div key={mood} className="space-y-2">
                      <div className="bg-muted/50 px-3 py-1.5 rounded-md">
                        <h4 className="text-sm font-semibold">{mood}</h4>
                      </div>
                      <div className="grid grid-cols-2 gap-2 pl-2">
                        {moodTenses.map((tense) => (
                          <div
                            key={tense.id}
                            className="flex items-center space-x-2 p-2 hover:bg-muted rounded-md cursor-pointer"
                            onClick={() => handleToggleTense(tense.id)}
                          >
                            <Checkbox
                              id={tense.id}
                              checked={selectedTenses.includes(tense.id)}
                              onCheckedChange={() => handleToggleTense(tense.id)}
                            />
                            <label
                              htmlFor={tense.id}
                              className="text-sm font-medium leading-none cursor-pointer flex-1"
                            >
                              {tense.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedTenses.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Seleccionados ({selectedTenses.length}):</p>
                  <div className="flex flex-wrap gap-1">
                    {selectedTenses.map((tenseId) => {
                      const tense = availableTenses.find((t) => t.id === tenseId);
                      return (
                        <Badge key={tenseId} variant="default" className="text-xs">
                          {tense?.mood}: {tense?.label}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-600">
                ℹ️ Las conjugaciones se generarán automáticamente cuando se integre la fuente de conjugaciones (verbecc/mlconjug3)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseVerbDialog}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveVerb}
              disabled={!infinitive.trim() || selectedTenses.length === 0 || createVerbMutation.isPending}
            >
              {createVerbMutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
