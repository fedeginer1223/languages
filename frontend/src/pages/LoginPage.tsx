import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { useAuth } from '../auth/AuthProvider';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { Label } from '../components/ui/label';

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const from = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const target = from?.pathname && from.pathname !== '/login' ? `${from.pathname}${from.search ?? ''}` : '/languages';

  if (!loading && user) return <Navigate to={target} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(target, { replace: true });
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      if (status === 401) setError('Email o contraseña incorrectos');
      else if (status === 429) setError('Demasiados intentos, espera unos minutos');
      else setError('No se pudo iniciar sesión. Inténtalo de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <h1 className="text-2xl font-bold text-center">LangLearn</h1>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && (
              <p className="text-red-600 text-sm" role="alert">{error}</p>
            )}
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
