import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { isAuthenticated } from './api/auth';
import { AppShell } from './components/layout/AppShell';
import { LoadingSpinner } from './components/shared/LoadingSpinner';
import { InstallBanner } from './components/shared/InstallBanner';
import type { ReactNode } from 'react';

/* Lazy-loaded pages — each becomes its own chunk */
const AssessmentPage = lazy(() => import('./pages/AssessmentPage').then(m => ({ default: m.AssessmentPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then(m => ({ default: m.HistoryPage })));
const ConfigPage = lazy(() => import('./pages/ConfigPage').then(m => ({ default: m.ConfigPage })));
const DetailsPage = lazy(() => import('./pages/DetailsPage').then(m => ({ default: m.DetailsPage })));
const HowItWorksPage = lazy(() => import('./pages/HowItWorksPage').then(m => ({ default: m.HowItWorksPage })));
const FaqPage = lazy(() => import('./pages/FaqPage').then(m => ({ default: m.FaqPage })));
const CohortPage = lazy(() => import('./pages/CohortPage').then(m => ({ default: m.CohortPage })));
const AiChallengesPage = lazy(() => import('./pages/AiChallengesPage').then(m => ({ default: m.AiChallengesPage })));
const ScenarioBrowserPage = lazy(() => import('./pages/ScenarioBrowserPage').then(m => ({ default: m.ScenarioBrowserPage })));
const ValidationPage = lazy(() => import('./pages/ValidationPage').then(m => ({ default: m.ValidationPage })));
const ValidationLeaderboardPage = lazy(() => import('./pages/ValidationLeaderboardPage').then(m => ({ default: m.ValidationLeaderboardPage })));
const ReproducibilityPage = lazy(() => import('./pages/ReproducibilityPage').then(m => ({ default: m.ReproducibilityPage })));
const IdeaAtlasPage = lazy(() => import('./pages/IdeaAtlasPage').then(m => ({ default: m.IdeaAtlasPage })));
const ForecastPage = lazy(() => import('./pages/ForecastPage').then(m => ({ default: m.ForecastPage })));
const VisualizationPage = lazy(() => import('./pages/VisualizationPage').then(m => ({ default: m.VisualizationPage })));
const TutorialPage = lazy(() => import('./pages/TutorialPage').then(m => ({ default: m.TutorialPage })));
const SupportLegalPage = lazy(() => import('./pages/SupportLegalPage').then(m => ({ default: m.SupportLegalPage })));
const LoginPage = lazy(() => import('./pages/LoginPage').then(m => ({ default: m.LoginPage })));

const CAS_COMPILER_URL = 'https://www.caslabai.com/compiler/';

function AuthGuard({ children }: { children: ReactNode }) {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function PublicOrShell({ children }: { children: ReactNode }) {
  if (isAuthenticated()) {
    return <AppShell>{children}</AppShell>;
  }
  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-[#050b0a] text-[#eaf3ee]">
      <div className="caslab-bar flex items-center justify-between px-4 py-2 sm:px-6">
        <a
          href="https://www.caslabai.com/#research"
          className="text-[#b3c2ba] transition-colors hover:text-[#37f5a0]"
        >
          ← CAS Lab
        </a>
        <div className="flex items-center gap-4">
          <span className="hidden sm:inline">CAS Compass · CAS Lab workbench</span>
          <Link to="/login" className="text-[#37f5a0] hover:underline">
            Sign in
          </Link>
        </div>
      </div>
      <main id="app-main-scroll" className="mx-auto w-full max-w-5xl flex-1 p-4 sm:p-6">
        {children}
      </main>
    </div>
  );
}

function CompilerMovedNotice() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <div className="rounded-[2px] border border-[#eaf3ee] bg-[#0c1513] p-6 sm:p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#37f5a0]">
          CAS Lab Ecosystem · Moved
        </p>
        <h1 className="mt-2 text-2xl font-bold text-[#eaf3ee]">
          CAS Compiler lives on CAS Lab
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#b3c2ba]">
          To avoid maintaining duplicate compilers, the interactive CAS notation compiler is hosted
          directly on CAS Lab. Your Idea Atlas and assessment workflows remain here in CAS Compass.
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={CAS_COMPILER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center rounded-[2px] bg-[#37f5a0] px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#050b0a] transition-opacity hover:opacity-90"
          >
            Open CAS Compiler ↗
          </a>
          <Link
            to="/scenarios"
            className="inline-flex min-h-[44px] items-center rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-[#eaf3ee] transition-colors hover:border-[#37f5a0]"
          >
            Return to Scenarios
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen bg-[#050b0a]"><LoadingSpinner /></div>}>
      <InstallBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/support" element={<PublicOrShell><SupportLegalPage /></PublicOrShell>} />
        <Route path="/legal" element={<PublicOrShell><SupportLegalPage /></PublicOrShell>} />
        <Route path="/privacy" element={<PublicOrShell><SupportLegalPage /></PublicOrShell>} />
        <Route path="/terms" element={<PublicOrShell><SupportLegalPage /></PublicOrShell>} />
        <Route
          path="/*"
          element={
            <AuthGuard>
              <AppShell>
                <Suspense fallback={<LoadingSpinner />}>
                  <Routes>
                    <Route path="/" element={<Navigate to="/scenarios" replace />} />
                    <Route path="/assessment" element={<AssessmentPage />} />
                    <Route path="/history" element={<HistoryPage />} />
                    <Route path="/config" element={<ConfigPage />} />
                    <Route path="/details/:id" element={<DetailsPage />} />
                    <Route path="/cohort" element={<CohortPage />} />
                    {/* /benchmark merged into /assessment (mode toggle) — keep a redirect for old bookmarks */}
                    <Route path="/benchmark" element={<Navigate to="/assessment" replace />} />
                    <Route path="/scenarios" element={<ScenarioBrowserPage />} />
                    <Route path="/validate" element={<ValidationPage />} />
                    <Route path="/validation/leaderboard" element={<ValidationLeaderboardPage />} />
                    <Route path="/reproducibility" element={<ReproducibilityPage />} />
                    <Route path="/compiler" element={<CompilerMovedNotice />} />
                    <Route path="/idea-atlas" element={<IdeaAtlasPage />} />
                    <Route path="/forecast" element={<ForecastPage />} />
                    <Route path="/visualization" element={<VisualizationPage />} />
                    <Route path="/tutorial" element={<TutorialPage />} />
                    <Route path="/ai-challenges" element={<AiChallengesPage />} />
                    <Route path="/how-it-works" element={<HowItWorksPage />} />
                    <Route path="/faq" element={<FaqPage />} />
                  </Routes>
                </Suspense>
              </AppShell>
            </AuthGuard>
          }
        />
      </Routes>
    </Suspense>
  );
}
