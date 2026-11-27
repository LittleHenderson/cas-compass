import type { ReactNode } from 'react';

export function ExplainPanel({
  children,
  visible,
  onClose,
}: {
  children: ReactNode;
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <div className="animate-slide-down rounded-[2px] border border-[#20302b] bg-[#0c1513] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2 text-[13px] leading-relaxed text-[#b3c2ba]">
          {children}
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="mt-0.5 flex-shrink-0 rounded-[2px] border border-transparent p-1 text-[#62706a] transition-colors hover:border-[#20302b] hover:text-[#eaf3ee]"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2.5 2.5L9.5 9.5M9.5 2.5L2.5 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
