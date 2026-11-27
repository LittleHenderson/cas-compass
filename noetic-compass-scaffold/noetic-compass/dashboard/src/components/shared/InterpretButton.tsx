import { useState, type ReactNode } from 'react';

interface InterpretButtonProps {
  interpretation: string | ReactNode;
}

export function InterpretButton({ interpretation }: InterpretButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1.5 rounded-[2px] border px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em] transition-colors ${
          open
            ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]'
            : 'border-[#20302b] bg-[#050b0a] text-[#86958d] hover:border-[#37f5a0] hover:text-[#37f5a0]'
        }`}
      >
        <span className="text-[11px]" aria-hidden="true">&#10022;</span>
        {open ? 'Hide' : 'Interpret'}
      </button>

      {open && (
        <div className="animate-slide-down mt-3 rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] p-4">
          <div className="text-xs leading-relaxed text-[#b3c2ba]">
            {interpretation}
          </div>
        </div>
      )}
    </div>
  );
}
