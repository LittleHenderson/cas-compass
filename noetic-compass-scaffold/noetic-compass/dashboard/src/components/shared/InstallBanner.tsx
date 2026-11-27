import { usePwaInstall } from '../../hooks/usePwaInstall';

export function InstallBanner() {
  const { showBanner, install, dismiss } = usePwaInstall();

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 safe-bottom">
      <div className="mx-4 mb-4 flex items-center gap-3 rounded-[2px] border border-[#eaf3ee] bg-[#0c1513] px-4 py-3 md:mx-auto md:max-w-md">
        <img src="/icon-192.svg" alt="" className="h-10 w-10 shrink-0 rounded-[2px]" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#eaf3ee]">Install CAS Compass</p>
          <p className="text-xs text-[#86958d]">Add the CAS Lab workbench to your home screen</p>
        </div>
        <button
          type="button"
          onClick={install}
          className="min-h-[44px] shrink-0 rounded-[2px] bg-[#37f5a0] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#050b0a] transition-opacity hover:opacity-90"
        >
          Install
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-[2px] border border-transparent text-[#86958d] transition-colors hover:border-[#20302b] hover:text-[#eaf3ee]"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M2 2l10 10M12 2L2 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
