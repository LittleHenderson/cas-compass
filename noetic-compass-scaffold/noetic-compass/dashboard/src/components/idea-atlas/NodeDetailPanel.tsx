import { useEffect, useState } from 'react';
import { apiFetch } from '../../api/client';
import {
  DiagramPreview,
  highlightSyntax,
  type CasDiagram,
} from '../shared/CasNotationRenderer';

export interface Idea {
  id: string;
  text: string;
  cas_expression: string | null;
  cas_english?: string | null;
  created_at: string;
  compile_error?: string | null;
  ast?: unknown;
  ast_json?: unknown;
}

export interface NodeDetailPanelProps {
  idea: Idea | null;
  onClose: () => void;
  onInvertClicked?: (idea: Idea) => void;
  onDeleteClicked?: (idea: Idea) => void;
}

interface CompileDiagramResponse {
  valid: boolean;
  error?: string | null;
  result?: Record<string, unknown> | null;
  diagram?: CasDiagram | null;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function NodeDetailPanel({
  idea,
  onClose,
  onInvertClicked,
  onDeleteClicked,
}: NodeDetailPanelProps) {
  const [open, setOpen] = useState(false);
  const [diagramResult, setDiagramResult] = useState<CompileDiagramResponse | null>(null);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [diagramError, setDiagramError] = useState<string | null>(null);

  useEffect(() => {
    if (idea) {
      const id = requestAnimationFrame(() => setOpen(true));
      return () => cancelAnimationFrame(id);
    } else {
      setOpen(false);
    }
  }, [idea?.id, idea]);

  useEffect(() => {
    if (!idea?.cas_expression || idea.compile_error) {
      setDiagramResult(null);
      setDiagramError(null);
      setDiagramLoading(false);
      return;
    }

    let cancelled = false;
    setDiagramLoading(true);
    setDiagramError(null);
    setDiagramResult(null);

    (async () => {
      try {
        const result = await apiFetch<CompileDiagramResponse>('/notation/compile', {
          method: 'POST',
          body: JSON.stringify({ expression: idea.cas_expression }),
        });
        if (!cancelled) setDiagramResult(result);
      } catch (err) {
        if (!cancelled) {
          setDiagramError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (!cancelled) setDiagramLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [idea?.id, idea?.cas_expression, idea?.compile_error]);

  const handleDelete = () => {
    if (!idea || !onDeleteClicked) return;
    onDeleteClicked(idea);
  };

  if (!idea) return null;

  const astPayload = idea.ast ?? idea.ast_json;

  return (
    <div
      className={`fixed top-0 right-0 z-40 h-full w-[360px] max-w-[90vw] transform border-l border-[#20302b] bg-[#0c1513] shadow-2xl transition-transform duration-200 ease-out ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}
      role="complementary"
      aria-label="Idea details"
    >
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#20302b] px-4 py-3">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-[#37f5a0]">
            Idea details
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-[2px] border border-[#20302b] px-2 py-1 font-mono text-xs text-[#86958d] hover:border-[#eaf3ee] hover:text-[#eaf3ee]"
            aria-label="Close panel"
          >
            ✕
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Original text */}
          <section>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">
              Original
            </p>
            <p className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-[#eaf3ee]">
              {idea.text}
            </p>
          </section>

          {/* CAS expression */}
          <section>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">
              CAS expression
            </p>
            {idea.compile_error ? (
              <div className="rounded-[2px] border border-[#ff7b72]/40 bg-[#13201c] p-2">
                <p className="whitespace-pre-wrap font-mono text-[11px] text-[#ff7b72]">
                  {idea.compile_error}
                </p>
              </div>
            ) : idea.cas_expression ? (
              <p className="font-mono text-sm leading-relaxed text-[#37f5a0]">
                {highlightSyntax(idea.cas_expression)}
              </p>
            ) : (
              <p className="text-xs italic text-[#86958d]">
                (no CAS expression)
              </p>
            )}
            {idea.cas_english && (
              <p className="mt-2 font-sans text-[11px] leading-relaxed text-[#b3c2ba]">
                {idea.cas_english}
              </p>
            )}
          </section>

          {/* Captured timestamp */}
          <section>
            <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">
              Captured
            </p>
            <p className="font-mono text-xs text-[#b3c2ba]">
              {formatTimestamp(idea.created_at)}
            </p>
          </section>

          {/* Compiler-level structure diagram */}
          {idea.cas_expression && !idea.compile_error && (
            <section>
              <div className="mb-2">
                <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">
                  CAS Structure
                </p>
                <p className="mt-1 font-sans text-[11px] leading-relaxed text-[#86958d]">
                  Internal compiler diagram for this expression. The graph view
                  shows relationships between ideas; this shows the structure
                  inside this one idea.
                </p>
              </div>
              {diagramLoading && (
                <div className="animate-pulse rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] p-3 font-mono text-[11px] text-[#37f5a0]">
                  Building CAS structure diagram...
                </div>
              )}
              {!diagramLoading && diagramError && (
                <div className="rounded-[2px] border border-[#ff7b72]/40 bg-[#13201c] p-3 font-mono text-[11px] text-[#ff7b72]">
                  {diagramError}
                </div>
              )}
              {!diagramLoading && !diagramError && diagramResult?.diagram && (
                <DiagramPreview
                  diagram={diagramResult.diagram}
                  result={diagramResult.result ?? null}
                />
              )}
            </section>
          )}

          {/* AST */}
          {astPayload !== undefined && astPayload !== null && (
            <section>
              <details className="rounded-[2px] border border-[#20302b] bg-[#050b0a]">
                <summary className="cursor-pointer px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d] hover:text-[#eaf3ee]">
                  AST
                </summary>
                <pre className="overflow-x-auto px-3 pb-3 font-mono text-[10px] leading-relaxed text-[#b3c2ba]">
                  {JSON.stringify(astPayload, null, 2)}
                </pre>
              </details>
            </section>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex items-center gap-2 border-t border-[#20302b] bg-[#050b0a] px-4 py-3">
          <button
            type="button"
            onClick={() => onInvertClicked?.(idea)}
            disabled={!onInvertClicked}
            className="flex-1 rounded-[2px] bg-[#37f5a0] px-3 py-1.5 font-mono text-xs font-semibold text-[#050b0a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Invert this idea…
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={!onDeleteClicked}
            className="rounded-[2px] border border-[#ff7b72]/50 bg-[#13201c] px-3 py-1.5 font-mono text-xs text-[#ff7b72] transition-colors hover:bg-[#ff7b72] hover:text-[#050b0a] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default NodeDetailPanel;
