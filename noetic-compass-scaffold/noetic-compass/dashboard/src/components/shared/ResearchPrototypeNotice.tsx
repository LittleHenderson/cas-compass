export function ResearchPrototypeNotice({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/[0.07] ${
        compact ? 'px-3 py-2' : 'px-4 py-3'
      } ${className}`.trim()}
    >
      <p
        className={`${
          compact ? 'text-[10px]' : 'text-[11px]'
        } font-mono font-medium uppercase tracking-[0.12em] text-[#f59e0b]`}
      >
        ◐ Research-stage output
      </p>
      <p className={`${compact ? 'mt-1 text-[11px]' : 'mt-1 text-xs'} text-[#b3c2ba]`}>
        Not a deployment certification.
      </p>
    </div>
  );
}
