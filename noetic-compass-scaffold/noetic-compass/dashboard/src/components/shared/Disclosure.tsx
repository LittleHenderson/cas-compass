import { useState, type ReactNode } from 'react';

interface DisclosureProps {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Inline collapsible used to tuck explanatory wordiness behind a one-line
 * summary. Keeps the default view uncluttered while leaving detail one tap away.
 */
export function Disclosure({ summary, children, defaultOpen = false, className = '' }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={`rounded-[2px] border border-[#20302b] bg-[#0c1513] ${className}`.trim()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[40px] w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-[#13201c]"
      >
        <span className="font-mono text-[11px] font-medium text-[#eaf3ee]">{summary}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 14 14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          className={`flex-shrink-0 text-[#86958d] transition-transform duration-150 ${open ? 'rotate-180 text-[#37f5a0]' : ''}`}
        >
          <path d="M3 5l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="animate-slide-down space-y-2 border-t border-[#17231f] bg-[#050b0a]/50 px-3.5 pb-3 pt-2.5 text-xs leading-relaxed text-[#b3c2ba]">
          {children}
        </div>
      )}
    </div>
  );
}
