import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, AlertCircle, Award } from 'lucide-react';
import { useState, useMemo } from 'react';
import { statsApi, topicsApi, wordsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { DataTable } from '../components/ui/data-table/DataTable';
import type { DataTableColumn } from '../components/ui/data-table/types';
import type { Word } from '../types';

type WordFilter = 'learned' | 'unlearned' | 'difficult' | null;

export default function StatsPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<WordFilter>(null);

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
    const learned: Word[] = [], unlearned: Word[] = [], difficult: Word[] = [];
    allWords.forEach(word => {
      if (word.attempts === 0) unlearned.push(word);
      else if (word.weightedScore >= 75) learned.push(word);
      else if (word.weightedScore < 50) difficult.push(word);
    });
    return { learned, unlearned, difficult };
  }, [allWords]);

  const displayWords = useMemo(() => {
    if (!allWords) return [];
    if (filter === 'learned') return allWords.filter(w => w.attempts > 0 && w.weightedScore >= 75);
    if (filter === 'unlearned') return allWords.filter(w => w.attempts === 0);
    if (filter === 'difficult') return allWords.filter(w => w.attempts > 0 && w.weightedScore < 50);
    return [...allWords];
  }, [allWords, filter]);

  const columns: DataTableColumn<Word>[] = useMemo(() => [
    {
      accessorKey: 'term',
      header: 'Término',
      enableColumnFilter: true,
      cell: ({ row }) => <span className="font-medium">{row.original.term}</span>,
      meta: { displayName: 'Término' },
    },
    {
      accessorKey: 'definition',
      header: 'Definición',
      enableColumnFilter: true,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.definition}</span>,
      meta: { displayName: 'Definición' },
    },
    {
      accessorKey: 'attempts',
      header: 'Intentos',
      enableColumnFilter: false,
      cell: ({ row }) => <div className="text-center">{row.original.attempts}</div>,
      meta: { align: 'center', displayName: 'Intentos' },
    },
    {
      accessorKey: 'correctCount',
      header: 'Aciertos',
      enableColumnFilter: false,
      cell: ({ row }) => <div className="text-center">{row.original.correctCount}</div>,
      meta: { align: 'center', displayName: 'Aciertos' },
    },
    {
      accessorKey: 'successRate',
      header: '% Éxito',
      enableColumnFilter: false,
      cell: ({ row }) => {
        const w = row.original;
        if (w.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return (
          <div className="text-center">
            <span className={w.successRate >= 75 ? 'text-green-600 font-semibold' : w.successRate >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>
              {Math.round(w.successRate)}%
            </span>
          </div>
        );
      },
      meta: { align: 'center', displayName: '% Éxito' },
    },
    {
      accessorKey: 'weightedScore',
      header: 'Dominio',
      enableColumnFilter: false,
      cell: ({ row }) => {
        const w = row.original;
        if (w.attempts === 0) return <div className="text-center text-muted-foreground">-</div>;
        return (
          <div className="text-center">
            <span className={w.weightedScore >= 75 ? 'text-green-600 font-semibold' : w.weightedScore >= 50 ? 'text-amber-600' : 'text-red-600 font-semibold'}>
              {Math.round(w.weightedScore)}%
            </span>
          </div>
        );
      },
      meta: { align: 'center', displayName: 'Dominio' },
    },
    {
      id: 'days',
      header: 'Días',
      enableColumnFilter: false,
      accessorFn: (row) => row.lastTrainedAt ? Math.floor((Date.now() - new Date(row.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24)) : 9999,
      cell: ({ row }) => {
        const w = row.original;
        if (!w.lastTrainedAt) return <div className="text-center text-muted-foreground">-</div>;
        const days = Math.floor((Date.now() - new Date(w.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24));
        return <div className="text-center text-sm">{days}</div>;
      },
      meta: { align: 'center', displayName: 'Días' },
    },
  ], []);

  const toggleFilter = (f: WordFilter) => {
    setFilter(prev => prev === f ? null : f);
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
            <Card className={`cursor-pointer hover:border-primary transition-all ${filter === 'learned' ? 'border-green-500 ring-1 ring-green-500' : ''}`} onClick={() => toggleFilter('learned')}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-green-500/10 p-3 rounded-lg"><Award className="w-6 h-6 text-green-600" /></div>
                  <Badge variant="default" className="bg-green-500">{allWords?.length ? `${Math.round((learned.length / allWords.length) * 100)}%` : '0%'}</Badge>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Aprendidas</h3>
                <p className="text-3xl font-bold text-green-600">{learned.length}</p>
                <p className="text-xs text-muted-foreground mt-2">Dominio ≥75%</p>
              </CardContent>
            </Card>

            <Card className={`cursor-pointer hover:border-primary transition-all ${filter === 'unlearned' ? 'border-blue-500 ring-1 ring-blue-500' : ''}`} onClick={() => toggleFilter('unlearned')}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-blue-500/10 p-3 rounded-lg"><BookOpen className="w-6 h-6 text-blue-600" /></div>
                  <Badge variant="secondary">{allWords?.length ? `${Math.round((unlearned.length / allWords.length) * 100)}%` : '0%'}</Badge>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">No Practicadas</h3>
                <p className="text-3xl font-bold text-blue-600">{unlearned.length}</p>
                <p className="text-xs text-muted-foreground mt-2">Sin intentos</p>
              </CardContent>
            </Card>

            <Card className={`cursor-pointer hover:border-primary transition-all ${filter === 'difficult' ? 'border-red-500 ring-1 ring-red-500' : ''}`} onClick={() => toggleFilter('difficult')}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="bg-red-500/10 p-3 rounded-lg"><AlertCircle className="w-6 h-6 text-red-600" /></div>
                  <Badge variant="secondary" className="bg-red-500/10 text-red-600">{allWords?.length ? `${Math.round((difficult.length / allWords.length) * 100)}%` : '0%'}</Badge>
                </div>
                <h3 className="text-sm font-medium text-muted-foreground mb-1">Difíciles</h3>
                <p className="text-3xl font-bold text-red-600">{difficult.length}</p>
                <p className="text-xs text-muted-foreground mt-2">Dominio &lt;50%</p>
              </CardContent>
            </Card>
          </div>

          {/* DataTable */}
          <div>
            <h2 className="text-xl font-semibold mb-2">
              {filter === 'learned' ? 'Aprendidas' : filter === 'unlearned' ? 'No Practicadas' : filter === 'difficult' ? 'Difíciles' : 'Todas las palabras'}
            </h2>
            <DataTable
              columns={columns}
              data={displayWords}
              searchPlaceholder="Buscar palabras..."
              tableId="stats-words"
              pageSize={25}
            />
          </div>
        </div>
      )}
    </div>
  );
}
