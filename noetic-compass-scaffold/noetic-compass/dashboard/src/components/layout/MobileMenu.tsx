import { useEffect } from 'react';
import { NavItems } from './Sidebar';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-in drawer used as the mobile alternative to the desktop Sidebar.
 *
 * Wraps the same NavItems list as Sidebar so navigation stays consistent
 * across viewports. Backdrop dimmer + tap-to-close + Escape-key close.
 */
export function MobileMenu({ open, onClose }: MobileMenuProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/75 transition-opacity duration-150 md:hidden ${
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col transform border-r border-[#20302b] bg-[#0c1513] p-4 transition-transform duration-150 ease-out md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="mb-4 flex items-center justify-between border-b border-[#20302b] pb-3 px-1">
          <span className="font-mono text-xs font-medium uppercase tracking-[0.1em] text-[#eaf3ee]">
            CAS Compass
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="flex min-h-[44px] min-w-[44px] -mr-1 items-center justify-center rounded-[2px] border border-transparent text-[#86958d] transition-colors hover:border-[#20302b] hover:text-[#eaf3ee]"
          >
            <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l10 10M14 4L4 14" />
            </svg>
          </button>
        </div>

        <NavItems onNavigate={onClose} />
      </aside>
    </>
  );
}

export default MobileMenu;
