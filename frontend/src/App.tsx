import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AuthProvider, useAuth } from './auth/AuthProvider';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import LanguagesPage from './pages/LanguagesPage';
import LanguageDetailPage from './pages/LanguageDetailPage';
import TopicDetailPage from './pages/TopicDetailPage';
import EssaysPage from './pages/EssaysPage';
import VerbsPage from './pages/VerbsPage';
import VerbSrsTrainingPage from './pages/VerbSrsTrainingPage';
import ErrorTrainingPage from './pages/ErrorTrainingPage';
import SrsTrainingPage from './pages/SrsTrainingPage';
import BooksPage from './pages/BooksPage';
import BookReaderPage from './pages/BookReaderPage';
import StructuresPage from './pages/StructuresPage';
import StructureSrsTrainingPage from './pages/StructureSrsTrainingPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
    },
  },
});

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 border-t-foreground animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/*"
              element={
                <RequireAuth>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Navigate to="/languages" replace />} />
                      <Route path="/languages" element={<LanguagesPage />} />
                      <Route path="/languages/:languageId" element={<LanguageDetailPage />} />
                      <Route path="/topics/:topicId" element={<TopicDetailPage />} />
                      <Route path="/languages/:languageId/essays" element={<EssaysPage />} />
                      <Route path="/languages/:languageId/verbs" element={<VerbsPage />} />
                      <Route path="/languages/:languageId/verb-srs-training" element={<VerbSrsTrainingPage />} />
                      <Route path="/languages/:languageId/error-training" element={<ErrorTrainingPage />} />
                      <Route path="/languages/:languageId/srs-training" element={<SrsTrainingPage />} />
                      <Route path="/languages/:languageId/structures" element={<StructuresPage />} />
                      <Route path="/languages/:languageId/structure-training" element={<StructureSrsTrainingPage />} />
                      <Route path="/languages/:languageId/books" element={<BooksPage />} />
                      <Route path="/books/:bookId/read" element={<BookReaderPage />} />
                    </Routes>
                  </Layout>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App
