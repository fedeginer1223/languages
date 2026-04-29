import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Pencil, Eye } from 'lucide-react';
import { useState } from 'react';
import { verbsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Checkbox } from '../components/ui/checkbox';
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
import type { Verb } from '../types';

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

export default function VerbsPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showVerbDialog, setShowVerbDialog] = useState(false);
  const [showConjugationsDialog, setShowConjugationsDialog] = useState(false);
  const [viewingVerb, setViewingVerb] = useState<Verb | null>(null);
  const [editingVerb, setEditingVerb] = useState<Verb | null>(null);
  const [infinitive, setInfinitive] = useState('');
  const [selectedTenses, setSelectedTenses] = useState<string[]>([]);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [verbSuggestions, setVerbSuggestions] = useState<string[]>([]);

  const { data: verbs, isLoading } = useQuery({
    queryKey: ['verbs', languageId],
    queryFn: () => verbsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  const createVerbMutation = useMutation({
    mutationFn: (data: { infinitive: string; tenses: string[] }) =>
      verbsApi.create(languageId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verbs', languageId] });
      handleCloseDialog();
    },
  });

  const deleteVerbMutation = useMutation({
    mutationFn: verbsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['verbs', languageId] });
    },
  });

  const handleOpenCreate = () => {
    setEditingVerb(null);
    setInfinitive('');
    setSelectedTenses([]);
    setShowAutocomplete(false);
    setVerbSuggestions([]);
    setShowVerbDialog(true);
  };

  const handleCloseDialog = () => {
    setShowVerbDialog(false);
    setEditingVerb(null);
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

    createVerbMutation.mutate({
      infinitive: infinitive.trim(),
      tenses: selectedTenses,
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

  // Por ahora usamos tiempos franceses siempre, en el futuro dependerá del idioma
  const availableTenses = FRENCH_TENSES;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Cargando...</div>
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
            onClick={() => navigate(`/languages/${languageId}`)}
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold">Verbos</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona los verbos para practicar sus conjugaciones
            </p>
          </div>
          <Button onClick={handleOpenCreate} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Añadir Verbo
          </Button>
        </div>
      </div>

      {/* Verbs Grid */}
      {verbs && verbs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {verbs.map((verb) => {
            const uniqueTenses = [...new Set(verb.conjugations.map((c) => c.tense))];
            const totalAttempts = verb.conjugations.reduce((sum, c) => sum + c.attempts, 0);
            const totalCorrect = verb.conjugations.reduce((sum, c) => sum + c.correctCount, 0);
            const avgSuccessRate = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;

            return (
              <Card
                key={verb.id}
                className="hover:border-primary transition-all group"
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
                        onClick={() => handleViewConjugations(verb)}
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => {
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
                  {/* Stats */}
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

                  {/* Tenses */}
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

                  {/* Conjugations count */}
                  <div className="text-xs text-muted-foreground pt-2 border-t">
                    {verb.conjugations.length} conjugaciones
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="max-w-6xl mx-auto">
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
                <Button onClick={handleOpenCreate} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Añadir Verbo
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {/* Add/Edit Verb Dialog */}
      <Dialog open={showVerbDialog} onOpenChange={setShowVerbDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVerb ? 'Editar Verbo' : 'Añadir Verbo'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Infinitive Input with Autocomplete */}
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

            {/* Tense Selection */}
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

            {/* Info about conjugations */}
            <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-600">
                Las conjugaciones se generan automáticamente a partir del infinitivo (7800+ verbos franceses)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog}>
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
