import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Layout from './components/Layout';
import LanguagesPage from './pages/LanguagesPage';
import LanguageDetailPage from './pages/LanguageDetailPage';
import TopicDetailPage from './pages/TopicDetailPage';
import EssaysPage from './pages/EssaysPage';
import VerbsPage from './pages/VerbsPage';
import VerbTrainingPage from './pages/VerbTrainingPage';
import VerbSrsTrainingPage from './pages/VerbSrsTrainingPage';
import ErrorTrainingPage from './pages/ErrorTrainingPage';
import SrsTrainingPage from './pages/SrsTrainingPage';
import DictationTrainingPage from './pages/DictationTrainingPage';
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Navigate to="/languages" replace />} />
            <Route path="/languages" element={<LanguagesPage />} />
            <Route path="/languages/:languageId" element={<LanguageDetailPage />} />
            <Route path="/topics/:topicId" element={<TopicDetailPage />} />
            <Route path="/languages/:languageId/essays" element={<EssaysPage />} />
            <Route path="/languages/:languageId/verbs" element={<VerbsPage />} />
            <Route path="/verbs/:verbId/training" element={<VerbTrainingPage />} />
            <Route path="/languages/:languageId/verb-srs-training" element={<VerbSrsTrainingPage />} />
            <Route path="/languages/:languageId/error-training" element={<ErrorTrainingPage />} />
            <Route path="/languages/:languageId/srs-training" element={<SrsTrainingPage />} />
            <Route path="/languages/:languageId/dictation-training" element={<DictationTrainingPage />} />
            <Route path="/languages/:languageId/structures" element={<StructuresPage />} />
            <Route path="/languages/:languageId/structure-training" element={<StructureSrsTrainingPage />} />
            <Route path="/languages/:languageId/books" element={<BooksPage />} />
            <Route path="/books/:bookId/read" element={<BookReaderPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App
