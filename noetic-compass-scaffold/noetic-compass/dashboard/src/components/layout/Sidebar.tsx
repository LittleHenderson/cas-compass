import { NavLink } from 'react-router-dom';
import { useHealth } from '../../hooks/useHealth';
import { useBreakpoint } from '../../hooks/useBreakpoint';

const CAS_COMPILER_URL = 'https://www.caslabai.com/compiler/';
const AUDIT_CONSOLE_URL =
  import.meta.env.VITE_AUDIT_PORTAL_URL || 'https://compass.caslabai.com/audit-console';

export interface NavItem {
  to: string;
  label: string;
  tip: string;
  icon: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Evaluate',
    items: [
      { to: '/tutorial', label: 'Start Here', tip: 'A five-minute guided tour', icon: 'M12 6v6l4 2m5-2a9 9 0 11-18 0 9 9 0 0118 0z' },
      { to: '/scenarios', label: 'Scenarios', tip: 'Browse 238 pre-built test prompts', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
      { to: '/assessment', label: 'Assessment', tip: "Score an AI's cognitive architecture", icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
      { to: '/cohort', label: 'Compare Models', tip: 'Run the same prompt on multiple models', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
      { to: '/history', label: 'History', tip: 'Your previous assessments', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
  {
    label: 'Analyze & Validate',
    items: [
      { to: '/idea-atlas', label: 'Idea Atlas', tip: 'Capture ideas; see their CAS structure', icon: 'M12 2v4m0 12v4m10-10h-4M6 12H2m15.07-7.07l-2.83 2.83M9.76 14.24l-2.83 2.83m0-12.14l2.83 2.83m4.48 4.48l2.83 2.83M16 12a4 4 0 11-8 0 4 4 0 018 0z' },
      { to: '/forecast', label: 'Risk Forecast', tip: 'Plain-language structural risk checks', icon: 'M11 3a8 8 0 108 8m-8-8v8h8M6.5 17.5l3-3 2 2 4-5' },
      { to: '/visualization', label: 'Visual + Audio', tip: 'See and hear the same CAS structure', icon: 'M4 13h3l3 7V4l-3 7H4v2zm10-6c1.5 1.5 2.25 3.17 2.25 5s-.75 3.5-2.25 5m3.5-13c2.4 2.4 3.5 5 3.5 8s-1.1 5.6-3.5 8' },
      { to: '/validate', label: 'Validation', tip: 'Rate model responses yourself', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
      { to: '/validation/leaderboard', label: 'Leaderboard', tip: 'Community validation rankings', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
      { to: '/reproducibility', label: 'Reproducibility', tip: 'Test-retest reliability measurement', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15' },
      { to: '/ai-challenges', label: 'AI Challenges', tip: 'Adversarial test scenarios', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    ],
  },
  {
    label: 'Configure & Reference',
    items: [
      { to: '/config', label: 'Operator Dials', tip: 'Tune the 10 CAS cognitive operator dials', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
      { to: '/how-it-works', label: 'How It Works', tip: 'The CAS framework explained', icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
      { to: '/faq', label: 'FAQ', tip: 'Frequently asked questions', icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    ],
  },
];

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Shared nav item list used by Sidebar (desktop) and MobileMenu (drawer). */
export function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav
      aria-label="Workbench navigation"
      className="flex flex-col gap-4 overflow-y-auto scroll-glow pr-1 -mr-1 md:flex-1 md:min-h-0"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="mb-1 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#62706a]">
            {group.label}
          </p>
          {group.items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              title={item.tip}
              className={({ isActive }) =>
                `flex min-h-[40px] items-center gap-3 rounded-[2px] border-l-2 px-3 py-2 text-[13px] font-medium transition-colors ${
                  isActive
                    ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]'
                    : 'border-transparent text-[#86958d] hover:bg-[#13201c]/60 hover:text-[#eaf3ee]'
                }`
              }
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d={item.icon} />
              </svg>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      ))}

      {/* CAS Lab Ecosystem section */}
      <div className="flex flex-col gap-0.5 border-t border-[#20302b] pt-3">
        <p className="mb-1 px-3 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[#62706a]">
          CAS Lab Ecosystem
        </p>

        <a
          href={CAS_COMPILER_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          title="Open the canonical CAS Compiler on caslabai.com"
          className="flex min-h-[40px] items-center justify-between gap-2 rounded-[2px] border-l-2 border-transparent px-3 py-2 text-[13px] font-medium text-[#b3c2ba] transition-colors hover:bg-[#13201c]/60 hover:text-[#37f5a0]"
        >
          <span className="flex items-center gap-3 truncate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="truncate">CAS Compiler</span>
          </span>
          <span className="font-mono text-[11px] text-[#62706a]" aria-hidden="true">↗</span>
        </a>

        <a
          href={AUDIT_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNavigate}
          title="Open Audit Console and 3D Cockpit"
          className="flex min-h-[40px] items-center justify-between gap-2 rounded-[2px] border-l-2 border-transparent px-3 py-2 text-[13px] font-medium text-[#b3c2ba] transition-colors hover:bg-[#13201c]/60 hover:text-[#37f5a0]"
        >
          <span className="flex items-center gap-3 truncate">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" />
            </svg>
            <span className="truncate">Audit &amp; 3D Cockpit</span>
          </span>
          <span className="font-mono text-[11px] text-[#62706a]" aria-hidden="true">↗</span>
        </a>

        <NavLink
          to="/support"
          onClick={onNavigate}
          title="Support, privacy, terms, and legal notices"
          className={({ isActive }) =>
            `flex min-h-[40px] items-center gap-3 rounded-[2px] border-l-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]'
                : 'border-transparent text-[#86958d] hover:bg-[#13201c]/60 hover:text-[#eaf3ee]'
            }`
          }
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className="truncate">Support &amp; Legal</span>
        </NavLink>

        {/* Download: Noetic Topos paper */}
        <a
          href="/noetic-topos.pdf"
          download="Noetic_Topos_CAS_v7.4.pdf"
          onClick={onNavigate}
          className="flex min-h-[40px] items-center gap-3 rounded-[2px] border-l-2 border-transparent px-3 py-2 text-[13px] font-medium text-[#86958d] transition-colors hover:bg-[#13201c]/60 hover:text-[#37f5a0]"
        >
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
          </svg>
          <span className="truncate">Noetic Topos (PDF)</span>
        </a>
      </div>
    </nav>
  );
}

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const health = useHealth();
  const isHealthy = health.data?.status === 'ok';
  const { isMobile } = useBreakpoint();

  return (
    <>
      {open && isMobile && (
        <div
          className="fixed inset-0 z-30 bg-black/75 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#20302b] bg-[#0c1513] p-4
          transform transition-transform duration-150 md:relative md:inset-auto md:h-full md:w-60 md:translate-x-0 md:overflow-hidden
          ${open ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#20302b] pb-3">
          <div className="flex items-center gap-2.5 px-1">
            <span
              className={`h-2 w-2 rounded-[1px] ${isHealthy ? 'bg-[#37f5a0]' : 'bg-[#ff7b72]'}`}
              aria-hidden="true"
            />
            <span
              className={`font-mono text-[11px] uppercase tracking-[0.08em] ${
                isHealthy ? 'text-[#37f5a0]' : 'text-[#ff7b72]'
              }`}
            >
              {isHealthy ? 'API Connected' : 'API Disconnected'}
            </span>
          </div>
          {isMobile && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close navigation"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-[2px] border border-[#20302b] text-[#86958d] hover:text-[#eaf3ee] md:hidden"
            >
              <svg width="14" height="14" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            </button>
          )}
        </div>

        <NavItems onNavigate={onClose} />
      </aside>
    </>
  );
}
