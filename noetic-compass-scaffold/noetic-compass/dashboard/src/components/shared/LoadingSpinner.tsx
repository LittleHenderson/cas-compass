export function LoadingSpinner({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center justify-center p-8" role="status" aria-label="Loading">
      <div
        className="animate-spin rounded-full border-2 border-[#20302b] border-t-[#37f5a0]"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
