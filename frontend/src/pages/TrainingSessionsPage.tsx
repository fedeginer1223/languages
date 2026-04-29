import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Trash2, Pencil, Check, X } from 'lucide-react';
import { useState } from 'react';
import { trainingApi } from '../services/api';
import type { TrainingSessionSummary } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';

export default function TrainingSessionsPage() {
  const { languageId } = useParams<{ languageId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const { data: sessions, isLoading } = useQuery({
    queryKey: ['training-sessions', languageId],
    queryFn: () => trainingApi.listSessions(languageId!),
    enabled: !!languageId,
  });

  const renameMutation = useMutation({
    mutationFn: ({ sessionId, name }: { sessionId: string; name: string }) =>
      trainingApi.renameSession(sessionId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions', languageId] });
      setEditingId(null);
      setEditName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (sessionId: string) => trainingApi.deleteSession(sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-sessions', languageId] });
    },
  });

  const handleCreateNewSession = () => {
    navigate(`/training?languageId=${languageId}&mode=by-level&new=true`);
  };

  const handleContinueSession = (sessionId: string) => {
    navigate(`/training?languageId=${languageId}&mode=by-level&sessionId=${sessionId}`);
  };

  const handleStartEdit = (session: TrainingSessionSummary) => {
    setEditingId(session.sessionId);
    setEditName(session.name || '');
  };

  const handleSaveEdit = (sessionId: string) => {
    renameMutation.mutate({ sessionId, name: editName });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

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
            <h1 className="text-3xl font-bold">Entrenamientos</h1>
            <p className="text-muted-foreground mt-1">
              Gestiona tus sesiones de práctica
            </p>
          </div>
          <Button
            onClick={handleCreateNewSession}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Nuevo Entrenamiento
          </Button>
        </div>
      </div>

      {/* Sessions Grid */}
      {sessions && sessions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {sessions.map((session) => {
            const progressPercentage = session.stats.total > 0
              ? Math.round((session.stats.answered / session.stats.total) * 100)
              : 0;
            const accuracy = session.stats.accuracy ?? 0;
            const sessionName = session.name || `Entrenamiento ${new Date(session.createdAt).toLocaleDateString()}`;

            return (
              <Card
                key={session.sessionId}
                className="hover:border-primary transition-all cursor-pointer group relative"
                onClick={() => !editingId && handleContinueSession(session.sessionId)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    {editingId === session.sessionId ? (
                      <div className="flex-1 flex items-center gap-2">
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveEdit(session.sessionId);
                            if (e.key === 'Escape') handleCancelEdit();
                          }}
                          autoFocus
                          className="h-8"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSaveEdit(session.sessionId);
                          }}
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCancelEdit();
                          }}
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <h3 className="text-lg font-bold group-hover:text-primary transition-colors">
                            {sessionName}
                          </h3>
                          <p className="text-xs text-muted-foreground mt-1">
                            {new Date(session.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(session);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (window.confirm('¿Eliminar este entrenamiento?')) {
                                deleteMutation.mutate(session.sessionId);
                              }
                            }}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Status + Type Badges */}
                  <div className="flex gap-2">
                    {session.completed ? (
                      <Badge variant="default" className="bg-green-500">Completado</Badge>
                    ) : (
                      <Badge variant="secondary">En progreso</Badge>
                    )}
                    <Badge variant="outline" className={session.trainingType === 'srs' ? 'border-amber-400 text-amber-700' : ''}>
                      {session.trainingType === 'srs' ? 'SRS' : 'Batch'}
                    </Badge>
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Progreso</span>
                      <span className="font-medium">{progressPercentage}%</span>
                    </div>
                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${progressPercentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {session.stats.answered} / {session.stats.total} palabras
                    </p>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Aprendidas</p>
                      <p className="text-lg font-bold">{session.stats.answered}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Acierto</p>
                      <p className="text-lg font-bold text-green-600">
                        {accuracy}%
                      </p>
                    </div>
                  </div>

                  {/* Action */}
                  {!editingId && (
                    <div className="pt-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        className="w-full"
                        onClick={() => handleContinueSession(session.sessionId)}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        {session.completed ? 'Revisar' : 'Continuar'}
                      </Button>
                    </div>
                  )}
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
                  <Play className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  No hay entrenamientos
                </h3>
                <p className="text-muted-foreground mb-4">
                  Crea tu primer entrenamiento para empezar a practicar
                </p>
                <Button onClick={handleCreateNewSession} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Nuevo Entrenamiento
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
