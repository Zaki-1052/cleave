// frontend/src/App.tsx
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { GradientBackground } from '@/components/layout/GradientBackground';
import { Navbar } from '@/components/layout/Navbar';
import { Breadcrumbs } from '@/components/layout/Breadcrumbs';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import ForgotPasswordPage from '@/pages/ForgotPasswordPage';
import ResetPasswordPage from '@/pages/ResetPasswordPage';
import LandingPage from '@/pages/LandingPage';
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
import NormalizationTab from '@/pages/experiment/NormalizationTab';
import TrimmingTab from '@/pages/experiment/TrimmingTab';
import DiffBindTab from '@/pages/experiment/DiffBindTab';
import HistoryTab from '@/pages/experiment/HistoryTab';
import AllFilesTab from '@/pages/experiment/AllFilesTab';
import PlaceholderTab from '@/pages/experiment/PlaceholderTab';
import AnalysisQueuePage from '@/pages/AnalysisQueuePage';
import SettingsPage from '@/pages/SettingsPage';
import AdminPage from '@/pages/AdminPage';
import DocsLayout from '@/components/docs/DocsLayout';
import DocsLandingPage from '@/pages/docs/DocsLandingPage';
import DocsPage from '@/pages/docs/DocsPage';
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
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/docs" element={<DocsLayout />}>
        <Route index element={<DocsLandingPage />} />
        <Route path=":slug" element={<DocsPage />} />
      </Route>
      <Route element={<ErrorBoundary><AuthenticatedLayout /></ErrorBoundary>}>
        <Route path="/dashboard" element={<HomePage />} />
        <Route path="/projects/:id" element={<ProjectDetailPage />} />
        <Route path="/experiments/:id" element={<ExperimentView />}>
          <Route index element={<DescriptionTab />} />
          <Route path="description" element={<DescriptionTab />} />
          <Route path="fastqs" element={<FastqsTab />} />
          <Route path="trimming/:jid" element={<TrimmingTab />} />
          <Route path="reactions" element={<ReactionsTab />} />
          <Route path="alignment/:jid" element={<AlignmentTab />} />
          <Route path="peaks/:jid" element={<PeakCallingTab />} />
          <Route path="diffbind/:jid" element={<DiffBindTab />} />
          <Route path="heatmaps/:jid" element={<CustomHeatmapTab />} />
          <Route path="correlations/:jid" element={<PearsonCorrelationTab />} />
          <Route path="normalization/:jid" element={<NormalizationTab />} />
          <Route path="de/:jid" element={<PlaceholderTab label="DE Analysis" />} />
          <Route path="rnaseq-qc/:jid" element={<PlaceholderTab label="QC Dashboard" />} />
          <Route path="pathway/:jid" element={<PlaceholderTab label="Pathway Analysis" />} />
          <Route path="history" element={<HistoryTab />} />
          <Route path="files" element={<AllFilesTab />} />
        </Route>
        <Route path="/queue" element={<AnalysisQueuePage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
      </Route>
    </Routes>
  );
}
