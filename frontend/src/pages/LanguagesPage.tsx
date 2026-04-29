import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, BookOpen, GraduationCap, Trash2, BarChart3 } from 'lucide-react';
import { languagesApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export default function LanguagesPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '' });

  const { data: languages, isLoading, error } = useQuery({
    queryKey: ['languages'],
    queryFn: languagesApi.getAll,
  });

  const createMutation = useMutation({
    mutationFn: languagesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] });
      setShowForm(false);
      setFormData({ name: '', code: '' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: languagesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 rounded-lg">
          Error loading languages
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Languages</h1>
          <p className="text-muted-foreground mt-1">Choose a language to start learning</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2">
          {showForm ? (
            <>Cancel</>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add Language
            </>
          )}
        </Button>
      </div>

      {showForm && (
        <Card className="mb-8">
          <CardHeader>
            <h2 className="text-xl font-semibold">New Language</h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Spanish"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="code">Code</Label>
                <Input
                  id="code"
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., es"
                  required
                />
              </div>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Language'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {languages && languages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {languages.map((language) => (
            <Card
              key={language.id}
              className="hover:border-border-hover transition-all cursor-pointer group"
              onClick={() => navigate(`/languages/${language.id}`)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-bold group-hover:text-primary transition-colors">
                      {language.name}
                    </h2>
                    <p className="text-sm text-muted-foreground uppercase">{language.code}</p>
                  </div>
                  <div className="bg-secondary p-2 rounded-lg">
                    <BookOpen className="w-5 h-5" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {language.stats?.topicsCount || 0} topics
                  </Badge>
                  <Badge variant="secondary">
                    {language.stats?.wordsCount || 0} words
                  </Badge>
                  <Badge variant="secondary">
                    {language.stats?.verbsCount || 0} verbs
                  </Badge>
                </div>

                {language.stats && language.stats.avgSuccessRate > 0 && (
                  <div>
                    <Badge
                      variant={
                        language.stats.avgSuccessRate >= 75
                          ? 'default'
                          : language.stats.avgSuccessRate >= 50
                          ? 'secondary'
                          : 'secondary'
                      }
                    >
                      {language.stats.avgSuccessRate}% success rate
                    </Badge>
                  </div>
                )}

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => navigate(`/training?languageId=${language.id}&mode=by-level`)}
                    className="flex items-center gap-1 flex-1"
                  >
                    <GraduationCap className="w-4 h-4" />
                    Train
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(`/languages/${language.id}/stats`)}
                    className="flex items-center gap-1"
                  >
                    <BarChart3 className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (window.confirm('Delete this language?')) {
                        deleteMutation.mutate(language.id);
                      }
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        !showForm && (
          <Card className="text-center">
            <CardContent className="py-12">
              <div className="flex flex-col items-center">
                <div className="bg-secondary p-4 rounded-full mb-4">
                  <BookOpen className="w-12 h-12 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  No languages yet
                </h3>
                <p className="text-muted-foreground mb-4">
                  Add your first language to start learning
                </p>
                <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  Add Language
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      )}
    </div>
  );
}
