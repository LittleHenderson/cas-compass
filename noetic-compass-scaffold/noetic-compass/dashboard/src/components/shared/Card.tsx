import type { ReactNode } from 'react';

export function Card({
  title,
  children,
  className = '',
  action,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={`glass-card p-5 animate-chart-in ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-center justify-between gap-2 border-b border-[#17231f] pb-3">
          {title && (
            <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#86958d]">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
