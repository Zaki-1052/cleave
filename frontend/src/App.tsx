// frontend/src/App.tsx
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { GradientBackground } from '@/components/layout/GradientBackground';
import { Navbar } from '@/components/layout/Navbar';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import HomePage from '@/pages/HomePage';
import ProjectDetailPage from '@/pages/ProjectDetailPage';
import ExperimentView from '@/pages/ExperimentView';
import DescriptionTab from '@/pages/experiment/DescriptionTab';
import FastqsTab from '@/pages/experiment/FastqsTab';
import ReactionsTab from '@/pages/experiment/ReactionsTab';
import AlignmentTab from '@/pages/experiment/AlignmentTab';
import PeakCallingTab from '@/pages/experiment/PeakCallingTab';
import CustomHeatmapTab from '@/pages/experiment/CustomHeatmapTab';
import PearsonCorrelationTab from '@/pages/experiment/PearsonCorrelationTab';
import DiffBindTab from '@/pages/experiment/DiffBindTab';
import HistoryTab from '@/pages/experiment/HistoryTab';
import AllFilesTab from '@/pages/experiment/AllFilesTab';
import AnalysisQueuePage from '@/pages/AnalysisQueuePage';
import SettingsPage from '@/pages/SettingsPage';
import { useSSE } from '@/hooks/useSSE';

function AuthenticatedLayout() {
  useSSE();
  return (
    <GradientBackground>
      <Navbar />
      <Breadcrumbs />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <ProtectedRoute />
      </main>
    </GradientBackground>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<AuthenticatedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/experiments/:id" element={<ExperimentView />}>
          <Route index element={<DescriptionTab />} />
          <Route path="description" element={<DescriptionTab />} />
          <Route path="fastqs" element={<FastqsTab />} />
          <Route path="reactions" element={<ReactionsTab />} />
          <Route path="alignment/:jid" element={<AlignmentTab />} />
          <Route path="peaks/:jid" element={<PeakCallingTab />} />
          <Route path="diffbind/:jid" element={<DiffBindTab />} />
          <Route path="heatmaps/:jid" element={<CustomHeatmapTab />} />
          <Route path="correlations/:jid" element={<PearsonCorrelationTab />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="files" element={<AllFilesTab />} />
        </Route>
        <Route path="/queue" element={<AnalysisQueuePage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
