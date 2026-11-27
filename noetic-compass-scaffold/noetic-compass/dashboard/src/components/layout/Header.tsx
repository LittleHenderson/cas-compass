import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isAuthenticated, clearToken } from '../../api/auth';

const MOTION_STORAGE_KEY = 'cas_motion_paused';
const CAS_COMPILER_URL = 'https://www.caslabai.com/compiler/';
const AUDIT_CONSOLE_URL =
  import.meta.env.VITE_AUDIT_PORTAL_URL || 'https://compass.caslabai.com/audit-console';

function readStoredMotionPaused(): boolean {
  try {
    return localStorage.getItem(MOTION_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function CasLabBrandMark({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <polygon
        points="32,7 57,53 7,53"
        stroke="#eaf3ee"
        strokeWidth="3.2"
        strokeLinejoin="miter"
        fill="none"
      />
      <path
        d="M31 28 C27 28 24.5 30.5 24.5 33.5 C23 34.5 22 36.2 22.5 38.5 C22.8 40.5 24.2 42 26 42.5 C26.5 44.5 28.5 46 31 46 Z"
        stroke="#37f5a0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="rgba(55, 245, 160, 0.14)"
      />
      <path
        d="M33 28 C37 28 39.5 30.5 39.5 33.5 C41 34.5 42 36.2 41.5 38.5 C41.2 40.5 39.8 42 38 42.5 C37.5 44.5 35.5 46 33 46 Z"
        stroke="#37f5a0"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="rgba(55, 245, 160, 0.14)"
      />
      <path
        d="M27.5 34.5 H30.5 M26.5 39.5 H30.5 M33.5 34.5 H36.5 M33.5 39.5 H37.5"
        stroke="#37f5a0"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface HeaderProps {
  onMenuToggle?: () => void;
  sidebarOpen?: boolean;
}

export function Header({ onMenuToggle, sidebarOpen }: HeaderProps) {
  const navigate = useNavigate();
  const authed = isAuthenticated();
  const [motionPaused, setMotionPaused] = useState<boolean>(readStoredMotionPaused);

  useEffect(() => {
    if (motionPaused) {
      document.documentElement.dataset.motionPaused = 'true';
    } else {
      delete document.documentElement.dataset.motionPaused;
    }
    try {
      localStorage.setItem(MOTION_STORAGE_KEY, String(motionPaused));
    } catch {
      // Ignore storage errors in restricted contexts.
    }
  }, [motionPaused]);

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <header className="flex min-h-[3.75rem] shrink-0 items-center justify-between gap-2 border-b border-[#eaf3ee] bg-black px-3 py-2 sm:px-5">
      <div className="flex items-center gap-2.5">
        {/* Hamburger menu — mobile only */}
        {onMenuToggle && (
          <button
            type="button"
            onClick={onMenuToggle}
            className="flex min-h-[44px] min-w-[44px] -ml-1 items-center justify-center rounded-[2px] border border-transparent text-[#b3c2ba] transition-colors hover:border-[#20302b] hover:text-[#eaf3ee] md:hidden"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? (
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 4l10 10M14 4L4 14" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 5h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2zm0 4h14a1 1 0 010 2H3a1 1 0 010-2z" />
              </svg>
            )}
          </button>
        )}

        <Link
          to="/scenarios"
          className="inline-flex items-center gap-2 text-[#eaf3ee] no-underline transition-opacity hover:opacity-90"
        >
          <CasLabBrandMark size={26} />
          <span className="font-['Space_Grotesk',sans-serif] text-base font-bold tracking-tight text-[#eaf3ee]">
            CAS
          </span>
          <span
            className="inline-flex items-center rounded-[2px] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{ backgroundColor: '#8b9096', color: '#050b0a' }}
          >
            Compass
          </span>
        </Link>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={() => setMotionPaused((prev) => !prev)}
          aria-pressed={motionPaused}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-[2px] border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] transition-colors ${
            motionPaused
              ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]'
              : 'border-[#20302b] bg-[#0c1513] text-[#b3c2ba] hover:border-[#62706a] hover:text-[#eaf3ee]'
          }`}
          title={motionPaused ? 'Resume UI motion' : 'Pause UI motion'}
        >
          <span aria-hidden="true">{motionPaused ? '▶' : '⏸'}</span>
          <span className="hidden sm:inline">{motionPaused ? 'Motion paused' : 'Pause motion'}</span>
        </button>

        <a
          href={CAS_COMPILER_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden min-h-[36px] items-center rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[#b3c2ba] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0] lg:inline-flex"
        >
          CAS Compiler ↗
        </a>

        <a
          href={AUDIT_CONSOLE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="hidden min-h-[36px] items-center rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[#b3c2ba] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0] md:inline-flex"
        >
          Audit Console ↗
        </a>

        {authed ? (
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex min-h-[36px] items-center rounded-[2px] border border-[#20302b] bg-[#0c1513] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.05em] text-[#eaf3ee] transition-colors hover:border-[#eaf3ee] hover:bg-[#13201c]"
          >
            Sign out
          </button>
        ) : (
          <span className="font-mono text-[11px] uppercase text-[#62706a]">Not signed in</span>
        )}
      </div>
    </header>
  );
}
