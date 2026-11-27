import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { WelcomeModal } from '../shared/WelcomeModal';
import { ContextualFaqButton } from '../shared/ContextualFaqButton';

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen h-[100dvh] flex-col bg-[#050b0a] text-[#eaf3ee]">
      <a href="#app-main-scroll" className="skip-link">
        Skip to main content
      </a>

      {/* Row 1: CAS Lab ecosystem bar */}
      <div className="caslab-bar flex shrink-0 items-center justify-between px-3 py-1.5 sm:px-5 safe-top">
        <a
          href="https://www.caslabai.com/#research"
          className="inline-flex items-center gap-1.5 text-[#b3c2ba] transition-colors hover:text-[#37f5a0]"
        >
          <span aria-hidden="true">←</span>
          <span>CAS Lab</span>
        </a>
        <span className="truncate text-[#86958d]">CAS Compass · CAS Lab workbench</span>
      </div>

      {/* Row 2: Product header */}
      <Header onMenuToggle={() => setSidebarOpen((o) => !o)} sidebarOpen={sidebarOpen} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main
          id="app-main-scroll"
          className="flex flex-1 flex-col overflow-y-auto bg-[#050b0a] -webkit-overflow-scrolling-touch"
        >
          <div className="flex-1 p-3 pb-8 sm:p-4 md:p-6">
            {children}
          </div>

          <footer className="mt-auto border-t border-[#20302b] bg-[#050b0a] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-3 text-xs text-[#86958d] sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  CAS Compass is a{' '}
                  <a
                    href="https://www.caslabai.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-[#eaf3ee] underline decoration-[#20302b] underline-offset-4 transition-colors hover:text-[#37f5a0] hover:decoration-[#37f5a0]"
                  >
                    CAS Lab
                  </a>{' '}
                  product
                </span>
                <span className="text-[#20302b]" aria-hidden="true">|</span>
                <span className="font-mono text-[11px] text-[#86958d]">
                  Zero third-party analytics · Local-first session storage
                </span>
              </div>

              <nav aria-label="Legal and support" className="flex flex-wrap items-center gap-4 font-mono text-[11px] uppercase tracking-[0.06em]">
                <Link to="/support" className="text-[#86958d] transition-colors hover:text-[#37f5a0]">
                  Support
                </Link>
                <Link to="/legal" className="text-[#86958d] transition-colors hover:text-[#37f5a0]">
                  Legal
                </Link>
                <Link to="/privacy" className="text-[#86958d] transition-colors hover:text-[#37f5a0]">
                  Privacy
                </Link>
                <Link to="/terms" className="text-[#86958d] transition-colors hover:text-[#37f5a0]">
                  Terms
                </Link>
              </nav>
            </div>
          </footer>
        </main>
      </div>
      <WelcomeModal />
      <ContextualFaqButton />
    </div>
  );
}
