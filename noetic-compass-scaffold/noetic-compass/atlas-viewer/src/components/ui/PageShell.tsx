import type { CSSProperties, ReactNode } from 'react';
import { motion, MotionConfig } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { useAccountAuth } from '../../auth/AccountAuthProvider';
import { COLORS, SPRING_GENTLE, THEME } from '../../lib/designTokens';
import { useMotionPaused } from '../../lib/motionPause';

export interface PageShellProps {
  children: ReactNode;
  showNav?: boolean;
  cardMaxWidth?: number;
}

const SIGNED_OUT_STEPS: Array<{ to: string; label: string }> = [
  { to: '/login', label: 'Sign in' },
];

const SIGNED_IN_STEPS: Array<{ to: string; label: string }> = [
  { to: '/model-config', label: 'Model' },
  { to: '/audit-console', label: 'Audit Console' },
  { to: '/cockpit', label: '3D Cockpit' },
  { to: '/account-security', label: 'Account' },
];

const ACCOUNT_OFF_STEPS = SIGNED_IN_STEPS.filter((step) => step.to !== '/account-security');

const shellContainerStyle: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  background: COLORS.ground,
  color: COLORS.textPrimary,
  fontFamily: THEME.fontFamily,
};

const mainStyle: CSSProperties = {
  position: 'relative',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '32px 20px 64px 20px',
  background: COLORS.ground,
  fontFamily: THEME.fontFamily,
  color: COLORS.textPrimary,
};

export function CasLabTriangleBrainMark({ size = 24 }: { size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <polygon
        points="14,2.5 26,24 2,24"
        stroke="#eaf3ee"
        strokeWidth="1.6"
        strokeLinejoin="miter"
        fill="#0c1513"
      />
      <path
        d="M14 8.5V21M14 12.2C11.8 11.4 10.2 12.6 10.4 14.5C10.5 15.8 11.8 16.5 14 16.5M14 12.2C16.2 11.4 17.8 12.6 17.6 14.5C17.5 15.8 16.2 16.5 14 16.5M11.2 18.8H16.8"
        stroke="#37f5a0"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
      <circle cx="14" cy="8.5" r="1.4" fill="#37f5a0" />
      <circle cx="10.4" cy="14.5" r="1.2" fill="#eaf3ee" />
      <circle cx="17.6" cy="14.5" r="1.2" fill="#eaf3ee" />
    </svg>
  );
}

export interface CasLabHeaderProps {
  showNav?: boolean;
  compact?: boolean;
}

export function CasLabHeader({ showNav = true, compact = false }: CasLabHeaderProps): JSX.Element {
  const location = useLocation();
  const auth = useAccountAuth();
  const { motionPaused, toggleMotionPaused } = useMotionPaused();

  const steps = !auth.accountsEnabled
    ? ACCOUNT_OFF_STEPS
    : auth.isAuthenticated
      ? SIGNED_IN_STEPS
      : SIGNED_OUT_STEPS;

  return (
    <>
      <div className="caslab-bar">
        <div
          className="caslab-bar-inner"
          style={compact ? { maxWidth: '100%', padding: '5px 14px' } : undefined}
        >
          <a href="https://www.caslabai.com/#research">← CAS Lab</a>
          <span>CAS Compass · Audit &amp; 3D Cockpit</span>
        </div>
      </div>

      <header className="caslab-header">
        <div
          className="caslab-header-inner"
          style={compact ? { maxWidth: '100%', padding: '8px 14px' } : undefined}
        >
          <Link
            to={auth.accountsEnabled && !auth.isAuthenticated ? '/login' : '/model-config'}
            className="caslab-brand"
            aria-label="CAS Compass — CAS Harness Audit"
          >
            <CasLabTriangleBrainMark size={compact ? 20 : 24} />
            <span className="caslab-brand-word">CAS</span>
            <span className="caslab-brand-pill">Compass</span>
            <span className="caslab-brand-sub">CAS HARNESS AUDIT</span>
          </Link>

          <nav className="caslab-nav-group" aria-label="CAS Compass navigation">
            {showNav
              ? steps.map((step) => {
                  const active = location.pathname.startsWith(step.to);
                  return (
                    <Link
                      key={step.to}
                      to={step.to}
                      className="caslab-nav-link"
                      aria-current={active ? 'page' : undefined}
                      data-testid={`nav-step-${step.to.slice(1)}`}
                    >
                      {step.label}
                    </Link>
                  );
                })
              : null}

            {showNav ? <span className="caslab-nav-divider" aria-hidden="true" /> : null}

            <a
              href="https://compass.caslabai.com/scenarios"
              target="_blank"
              rel="noopener noreferrer"
              className="caslab-nav-link"
            >
              Workbench ↗
            </a>
            <a
              href="https://www.caslabai.com/compiler/"
              target="_blank"
              rel="noopener noreferrer"
              className="caslab-nav-link"
            >
              CAS Compiler ↗
            </a>

            <span className="caslab-nav-divider" aria-hidden="true" />

            <button
              type="button"
              className="caslab-motion-btn"
              aria-pressed={motionPaused}
              onClick={toggleMotionPaused}
              data-testid="pause-motion-toggle"
            >
              {motionPaused ? 'Resume motion' : 'Pause motion'}
            </button>

            {auth.accountsEnabled && auth.isAuthenticated ? (
              <button
                type="button"
                className="caslab-nav-link"
                onClick={() => {
                  void auth.logout().catch(() => {
                    // AccountAuthProvider clears local state and records a
                    // memory-only warning for LoginPage when server revocation
                    // could not be confirmed.
                  });
                }}
              >
                Sign out
              </button>
            ) : null}
          </nav>
        </div>
      </header>
    </>
  );
}

export function PageShell({
  children,
  showNav = true,
  cardMaxWidth = 460,
}: PageShellProps) {
  const { motionPaused } = useMotionPaused();

  const cardStyle: CSSProperties = {
    width: '100%',
    maxWidth: cardMaxWidth,
  };

  return (
    <MotionConfig reducedMotion={motionPaused ? 'always' : 'user'}>
      <div style={shellContainerStyle}>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>

        <CasLabHeader showNav={showNav} />

        <main id="main-content" style={mainStyle}>
          <motion.div
            initial={motionPaused ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={motionPaused ? { duration: 0 } : SPRING_GENTLE}
            style={cardStyle}
          >
            {children}
          </motion.div>
        </main>

        <footer className="caslab-footer">
          <div className="caslab-footer-inner">
            <span>
              CAS Compass is a{' '}
              <a href="https://www.caslabai.com" target="_blank" rel="noopener noreferrer">
                CAS Lab
              </a>{' '}
              product · Zero analytics · No third-party tracking.
            </span>
            <span>
              Boundary: Customer-production status is OPEN. Research verdicts do not establish customer-production ACCEPT.
            </span>
          </div>
        </footer>
      </div>
    </MotionConfig>
  );
}

export default PageShell;
