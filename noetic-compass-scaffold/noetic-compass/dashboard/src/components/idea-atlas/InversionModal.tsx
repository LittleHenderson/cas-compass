import { useEffect, useState, useCallback } from 'react';
import { apiFetch, ApiError } from '../../api/client';
import { highlightSyntax } from '../shared/CasNotationRenderer';

// ── Types ──

export interface InversionModalIdea {
  id: string;
  text: string;
  cas_expression: string | null;
  cas_english?: string | null;
}

export interface InversionModalProps {
  idea: InversionModalIdea | null;
  onClose: () => void;
  onConfirm: (params: { invertedCas: string; axis: string }) => void;
}

interface InvertResponse {
  original_idea: { id: string; text: string; cas_expression: string | null };
  inverted_cas: string;
  inverted_ast: unknown;
  axis: string;
  axis_description: string;
}

// ── Axis catalog ──

interface AxisDef {
  key: 'N' | 'W' | 'F' | 'E' | 'S' | 'A' | 'P';
  label: string;
  short: string;
  comingSoon: boolean;
}

const AXES: AxisDef[] = [
  { key: 'N', label: 'Operator / Noetic involution (^2↔^3, ^5↔^6, ^8↔^9)', short: 'Noetic', comingSoon: false },
  { key: 'W', label: 'Domain precedence reversal (P↔O, C↔E)', short: 'Domain', comingSoon: false },
  { key: 'F', label: 'Drive pair flip (F1↔F7, F2↔F6, F3↔F5)', short: 'Drive', comingSoon: false },
  { key: 'E', label: 'State-vector entropy (coming soon)', short: 'Entropy', comingSoon: true },
  { key: 'S', label: 'Sub-drive variance (coming soon)', short: 'Sub-drive', comingSoon: true },
  { key: 'A', label: 'Pathway RPM chain (coming soon)', short: 'Pathway', comingSoon: true },
  { key: 'P', label: 'Compound (N + W + F)', short: 'Compound', comingSoon: false },
];

// ── Component ──

export function InversionModal({ idea, onClose, onConfirm }: InversionModalProps) {
  const [selectedAxis, setSelectedAxis] = useState<string | null>(null);
  const [result, setResult] = useState<InvertResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notImplemented, setNotImplemented] = useState(false);

  useEffect(() => {
    if (idea) {
      setSelectedAxis(null);
      setResult(null);
      setLoading(false);
      setError(null);
      setNotImplemented(false);
    }
  }, [idea?.id]);

  useEffect(() => {
    if (!idea) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idea, onClose]);

  const pickAxis = useCallback(
    async (axis: AxisDef) => {
      if (!idea || axis.comingSoon) return;
      setSelectedAxis(axis.key);
      setLoading(true);
      setError(null);
      setNotImplemented(false);
      setResult(null);
      try {
        const res = await apiFetch<InvertResponse>('/idea_atlas/invert', {
          method: 'POST',
          body: JSON.stringify({ idea_id: idea.id, axis: axis.key }),
        });
        setResult(res);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 501) {
            setNotImplemented(true);
          } else if (err.status === 422) {
            setError(`Compiler error: ${err.detail}`);
          } else {
            setError(err.detail || `Inversion failed (HTTP ${err.status}).`);
          }
        } else {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [idea],
  );

  const onCommit = useCallback(() => {
    if (!result) return;
    onConfirm({ invertedCas: result.inverted_cas, axis: result.axis });
  }, [result, onConfirm]);

  if (!idea) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#050b0a]/80 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="relative w-full max-w-2xl rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Invert idea"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#86958d] transition-colors hover:text-[#eaf3ee]"
          aria-label="Close"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
            Structural Inversion
          </p>
          <h2 className="mt-1 font-['Space_Grotesk',sans-serif] text-lg font-semibold text-[#eaf3ee]">
            Invert Idea
          </h2>
          <p className="mt-1 text-xs text-[#b3c2ba]">
            Pick an inversion axis to generate the structural opposite of this idea.
          </p>
        </div>

        {/* Original idea */}
        <div className="mb-5 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">Original</p>
          <p className="text-sm text-[#eaf3ee]">{idea.text}</p>
          {idea.cas_expression && (
            <p className="mt-2 font-mono text-xs">{highlightSyntax(idea.cas_expression)}</p>
          )}
        </div>

        {/* Axis picker */}
        <div className="mb-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">Inversion Axis</p>
          <div className="flex flex-wrap gap-2">
            {AXES.map((axis) => {
              const isSelected = selectedAxis === axis.key;
              const disabled = axis.comingSoon || loading;
              return (
                <button
                  key={axis.key}
                  onClick={() => pickAxis(axis)}
                  disabled={disabled}
                  title={axis.label}
                  className={[
                    'group relative rounded-[2px] border px-3 py-1.5 font-mono text-xs transition-colors',
                    isSelected
                      ? 'border-[#37f5a0] bg-[#37f5a0] text-[#050b0a]'
                      : 'border-[#20302b] bg-[#13201c] text-[#eaf3ee] hover:border-[#37f5a0]',
                    disabled && !isSelected ? 'cursor-not-allowed opacity-40 hover:border-[#20302b]' : '',
                  ].join(' ')}
                  aria-pressed={isSelected}
                >
                  <span className="font-bold">{axis.key}</span>
                  <span className={`ml-1 text-[10px] ${isSelected ? 'text-[#050b0a]/80' : 'text-[#86958d]'}`}>
                    {axis.short}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Result region */}
        <div className="min-h-[120px] rounded-[2px] border border-[#20302b] bg-[#050b0a] p-3">
          {loading && (
            <div className="flex items-center gap-2 font-mono text-xs text-[#b3c2ba]">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[#37f5a0] border-t-transparent" />
              Inverting along axis {selectedAxis}…
            </div>
          )}

          {!loading && notImplemented && (
            <p className="text-xs text-[#f59e0b]">
              This axis is not yet implemented (planned for a later sprint).
            </p>
          )}

          {!loading && error && (
            <p className="text-xs text-[#ff7b72]">{error}</p>
          )}

          {!loading && !error && !notImplemented && result && (
            <div className="space-y-3">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">Original CAS</p>
                <p className="font-mono text-xs text-[#b3c2ba]">
                  {idea.cas_expression ? highlightSyntax(idea.cas_expression) : <span className="italic">none</span>}
                </p>
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">Inverted CAS</p>
                <p className="font-mono text-xs">{highlightSyntax(result.inverted_cas)}</p>
              </div>
              <p className="text-[11px] italic text-[#b3c2ba]">{result.axis_description}</p>
            </div>
          )}

          {!loading && !error && !notImplemented && !result && !selectedAxis && (
            <p className="text-xs text-[#86958d]">Select an axis above to preview the inversion.</p>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-[2px] border border-[#eaf3ee] px-3 py-1.5 text-xs font-medium text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
          >
            Cancel
          </button>
          <button
            onClick={onCommit}
            disabled={!result || loading}
            className={[
              'rounded-[2px] px-4 py-1.5 text-xs font-semibold transition-opacity',
              !result || loading
                ? 'cursor-not-allowed border border-[#20302b] bg-[#13201c] text-[#86958d]'
                : 'bg-[#37f5a0] text-[#050b0a] hover:opacity-90',
            ].join(' ')}
          >
            Commit Inversion
          </button>
        </div>
      </div>
    </div>
  );
}

export default InversionModal;
