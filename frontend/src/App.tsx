import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import Layout from './components/Layout';
import LanguagesPage from './pages/LanguagesPage';
import LanguageDetailPage from './pages/LanguageDetailPage';
import TopicDetailPage from './pages/TopicDetailPage';
import TrainingPage from './pages/TrainingPage';
import TrainingSessionsPage from './pages/TrainingSessionsPage';
import EssaysPage from './pages/EssaysPage';
import VerbsPage from './pages/VerbsPage';
import VerbTrainingPage from './pages/VerbTrainingPage';
import StatsPage from './pages/StatsPage';
import ErrorTrainingPage from './pages/ErrorTrainingPage';
import SrsTrainingPage from './pages/SrsTrainingPage';

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
            <Route path="/training" element={<TrainingPage />} />
            <Route path="/languages/:languageId/training-sessions" element={<TrainingSessionsPage />} />
            <Route path="/languages/:languageId/essays" element={<EssaysPage />} />
            <Route path="/languages/:languageId/verbs" element={<VerbsPage />} />
            <Route path="/verbs/:verbId/training" element={<VerbTrainingPage />} />
            <Route path="/languages/:languageId/stats" element={<StatsPage />} />
            <Route path="/languages/:languageId/error-training" element={<ErrorTrainingPage />} />
            <Route path="/languages/:languageId/srs" element={<SrsTrainingPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

export default App
