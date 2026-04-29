import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { topicsApi, wordsApi } from '../services/api';

export default function TopicDetailPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ term: '', definition: '' });

  const { data: topic } = useQuery({
    queryKey: ['topics', topicId],
    queryFn: () => topicsApi.getById(topicId!),
    enabled: !!topicId,
  });

  const { data: words, isLoading } = useQuery({
    queryKey: ['words', topicId],
    queryFn: () => wordsApi.getByTopicId(topicId!, { sortBy: 'learning' }),
    enabled: !!topicId,
  });

  const createMutation = useMutation({
    mutationFn: (data: { term: string; definition: string }) =>
      wordsApi.create(topicId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words', topicId] });
      setShowForm(false);
      setFormData({ term: '', definition: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: wordsApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['words', topicId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  if (isLoading) return <div className="loading">Cargando...</div>;

  return (
    <div className="container">
      <div className="page-header">
        <button
          className="button button-secondary"
          onClick={() => navigate(`/languages/${topic?.languageId}`)}
        >
          ← Volver
        </button>
        <h1>{topic?.name}</h1>
        {topic?.description && <p>{topic.description}</p>}
      </div>

      <div className="page-header">
        <h2>Palabras</h2>
        <button className="button" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancelar' : 'Agregar Palabra'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3>Nueva Palabra</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Término</label>
              <input
                type="text"
                className="input"
                value={formData.term}
                onChange={(e) => setFormData({ ...formData, term: e.target.value })}
                placeholder="Ej: hablar"
                required
              />
            </div>
            <div className="form-group">
              <label>Definición</label>
              <input
                type="text"
                className="input"
                value={formData.definition}
                onChange={(e) => setFormData({ ...formData, definition: e.target.value })}
                placeholder="Ej: to speak"
                required
              />
            </div>
            <button type="submit" className="button" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creando...' : 'Crear Palabra'}
            </button>
          </form>
        </div>
      )}

      <div>
        {words?.map((word) => (
          <div key={word.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <h3>{word.term}</h3>
                <p style={{ color: '#666' }}>{word.definition}</p>
                <div style={{ marginTop: '10px' }}>
                  {word.attempts > 0 && (
                    <>
                      <span className="stats-badge">{word.attempts} intentos</span>
                      <span
                        className={`stats-badge ${
                          word.successRate >= 75
                            ? 'success-rate-high'
                            : word.successRate >= 50
                            ? 'success-rate-medium'
                            : 'success-rate-low'
                        }`}
                      >
                        {word.successRate}% aciertos
                      </span>
                    </>
                  )}
                  {word.attempts === 0 && (
                    <span className="stats-badge">Sin practicar</span>
                  )}
                </div>
              </div>
              <button
                className="button button-danger"
                onClick={() => {
                  if (window.confirm('¿Eliminar esta palabra?')) {
                    deleteMutation.mutate(word.id);
                  }
                }}
                disabled={deleteMutation.isPending}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {words?.length === 0 && !showForm && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p>No hay palabras todavía. Agrega algunas para empezar a practicar.</p>
        </div>
      )}
    </div>
  );
}
