import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, AlertCircle, Award, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { statsApi, topicsApi, wordsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../components/ui/table';
import type { Word } from '../types';

type WordFilter = 'learned' | 'unlearned' | 'difficult' | null;

export default function StatsPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<WordFilter>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['stats', languageId],
    queryFn: () => statsApi.getLanguageStats(languageId!),
    enabled: !!languageId,
  });

  const { data: topics } = useQuery({
    queryKey: ['topics', languageId],
    queryFn: () => topicsApi.getByLanguageId(languageId!),
    enabled: !!languageId,
  });

  const topicIds = topics?.map(t => t.id) || [];
  const { data: allWords } = useQuery({
    queryKey: ['all-words', languageId, topicIds],
    queryFn: async () => {
      if (!topicIds.length) return [];
      const wordsArrays = await Promise.all(
        topicIds.map(topicId => wordsApi.getByTopicId(topicId, { limit: 10000 }))
      );
      return wordsArrays.flat();
    },
    enabled: !!languageId && topicIds.length > 0,
  });

  const { learned, unlearned, difficult } = useMemo(() => {
    if (!allWords) return { learned: [] as Word[], unlearned: [] as Word[], difficult: [] as Word[] };
    const learned: Word[] = [];
    const unlearned: Word[] = [];
    const difficult: Word[] = [];
    allWords.forEach(word => {
      if (word.attempts === 0) unlearned.push(word);
      else if (word.successRate >= 75) learned.push(word);
      else if (word.successRate < 50) difficult.push(word);
    });
    return { learned, unlearned, difficult };
  }, [allWords]);

  // All words sorted by success rate asc, then filtered
  const displayWords = useMemo(() => {
    if (!allWords) return [];
    let words = [...allWords];
    if (filter === 'learned') words = words.filter(w => w.attempts > 0 && w.successRate >= 75);
    else if (filter === 'unlearned') words = words.filter(w => w.attempts === 0);
    else if (filter === 'difficult') words = words.filter(w => w.attempts > 0 && w.successRate < 50);

    words.sort((a, b) => {
      if (a.attempts === 0 && b.attempts === 0) return 0;
      if (a.attempts === 0) return 1;
      if (b.attempts === 0) return -1;
      return a.successRate - b.successRate;
    });
    return words;
  }, [allWords, filter]);

  const totalPages = Math.ceil(displayWords.length / rowsPerPage);
  const paginatedWords = displayWords.slice(page * rowsPerPage, (page + 1) * rowsPerPage);

  const toggleFilter = (f: WordFilter) => {
    setFilter(prev => prev === f ? null : f);
    setPage(0);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><div className="text-muted-foreground">Cargando...</div></div>;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/languages/${languageId}`)}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold">Estadísticas</h1>
          <p className="text-muted-foreground mt-1">Analiza tu progreso y áreas de mejora</p>
        </div>
      </div>

      {stats && (
        <div className="space-y-6">
          {/* KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card
              className={`cursor-pointer hover:border-primary transition-all ${filter === 'learned' ? 'border-green-500 ring-1 ring-green-500' : ''}`}
              onClick={() => toggleFilter('learned')}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-green-500/10 p-3 rounded-lg"><Award className="w-6 h-6 text-green-600" /></div>
                  <Badge variant="default" className="bg-green-500">
                    {allWords?.length ? `${Math.round((learned.length / allWords.length) * 100)}%` : '0%'}
                  </Badge>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Aprendidas</h3>
                <p className="text-3xl font-bold text-green-600">{learned.length}</p>
                <p className="text-xs text-muted-foreground mt-2">≥75% acierto</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:border-primary transition-all ${filter === 'unlearned' ? 'border-blue-500 ring-1 ring-blue-500' : ''}`}
              onClick={() => toggleFilter('unlearned')}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-500/10 p-3 rounded-lg"><BookOpen className="w-6 h-6 text-blue-600" /></div>
                  <Badge variant="secondary">
                    {allWords?.length ? `${Math.round((unlearned.length / allWords.length) * 100)}%` : '0%'}
                  </Badge>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">No Practicadas</h3>
                <p className="text-3xl font-bold text-blue-600">{unlearned.length}</p>
                <p className="text-xs text-muted-foreground mt-2">Sin intentos</p>
              </CardContent>
            </Card>

            <Card
              className={`cursor-pointer hover:border-primary transition-all ${filter === 'difficult' ? 'border-red-500 ring-1 ring-red-500' : ''}`}
              onClick={() => toggleFilter('difficult')}
            >
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-red-500/10 p-3 rounded-lg"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                  <Badge variant="secondary" className="bg-red-500/10 text-red-600">
                    {allWords?.length ? `${Math.round((difficult.length / allWords.length) * 100)}%` : '0%'}
                  </Badge>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Difíciles</h3>
                <p className="text-3xl font-bold text-red-600">{difficult.length}</p>
                <p className="text-xs text-muted-foreground mt-2">&lt;50% acierto</p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {filter === 'learned' ? 'Aprendidas' : filter === 'unlearned' ? 'No Practicadas' : filter === 'difficult' ? 'Difíciles' : 'Todas las palabras'}
                  </h2>
                  <p className="text-sm text-muted-foreground">{displayWords.length} palabras</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {paginatedWords.length > 0 ? (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Término</TableHead>
                        <TableHead>Definición</TableHead>
                        <TableHead className="text-center">Intentos</TableHead>
                        <TableHead className="text-center">Aciertos</TableHead>
                        <TableHead className="text-center">% Éxito</TableHead>
                        <TableHead className="text-center">Días</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedWords.map((word) => (
                        <TableRow key={word.id}>
                          <TableCell className="font-medium">{word.term}</TableCell>
                          <TableCell className="text-muted-foreground">{word.definition}</TableCell>
                          <TableCell className="text-center">{word.attempts}</TableCell>
                          <TableCell className="text-center">{word.correctCount}</TableCell>
                          <TableCell className="text-center">
                            {word.attempts > 0 ? (
                              <span className={
                                word.successRate >= 75 ? 'text-green-600 font-semibold'
                                : word.successRate >= 50 ? 'text-amber-600'
                                : 'text-red-600 font-semibold'
                              }>
                                {Math.round(word.successRate)}%
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {word.lastTrainedAt ? (
                              (() => {
                                const days = Math.floor((Date.now() - new Date(word.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24));
                                return days === 0 ? 'Hoy' : `${days}d`;
                              })()
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {/* Pagination */}
                  <div className="flex items-center justify-between pt-4 border-t mt-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Filas:</span>
                      {[10, 25, 50, 100].map((n) => (
                        <Button
                          key={n}
                          variant={rowsPerPage === n ? 'default' : 'outline'}
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => { setRowsPerPage(n); setPage(0); }}
                        >
                          {n}
                        </Button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {page * rowsPerPage + 1}-{Math.min((page + 1) * rowsPerPage, displayWords.length)} de {displayWords.length}
                      </span>
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-7 w-7" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="py-8 text-center text-muted-foreground">No hay palabras</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
