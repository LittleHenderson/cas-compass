/**
 * CohortHeatmap — NxN alignment heatmap showing pairwise cognitive
 * proximity between all models in the cohort.
 */

import { Fragment, useState } from 'react';
import type { CohortCompareResult } from '../../api/types';

/** Shared color function for alignment/similarity percentages.
 *  Used by both CohortHeatmap cells and CohortPage table text. */
export function cohortColor(pct: number, mode: 'bg' | 'text' = 'bg'): string {
  if (mode === 'text') {
    if (pct >= 80) return '#37f5a0';   // biolume accent
    if (pct >= 60) return '#86efac';   // soft green
    if (pct >= 40) return '#f59e0b';   // warn
    return '#ff7b72';                  // error
  }
  // bg mode — crisp editorial heat bands
  if (pct >= 90) return 'rgba(55, 245, 160, 0.34)';
  if (pct >= 75) return 'rgba(55, 245, 160, 0.22)';
  if (pct >= 60) return 'rgba(55, 245, 160, 0.14)';
  if (pct >= 45) return 'rgba(245, 158, 11, 0.22)';
  if (pct >= 30) return 'rgba(245, 158, 11, 0.15)';
  return 'rgba(255, 123, 114, 0.24)';
}

/** Crisp border highlight for cells without pulsing neon glow. */
function cellBorder(pct: number, isDiag: boolean): React.CSSProperties {
  if (isDiag) return { border: '1px solid #20302b' };
  if (pct >= 85) return { border: '1px solid rgba(55, 245, 160, 0.45)' };
  if (pct >= 70) return { border: '1px solid rgba(55, 245, 160, 0.25)' };
  if (pct >= 45) return { border: '1px solid rgba(245, 158, 11, 0.35)' };
  return { border: '1px solid rgba(255, 123, 114, 0.4)' };
}

export function CohortHeatmap({ result }: { result: CohortCompareResult }) {
  const { labels, distances } = result;
  const n = labels.length;
  const [selectedCell, setSelectedCell] = useState<{ i: number; j: number } | null>(null);

  // Build NxN alignment matrix
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(100));
  for (const d of distances) {
    const i = labels.indexOf(d.from_label);
    const j = labels.indexOf(d.to_label);
    if (i >= 0 && j >= 0) {
      matrix[i][j] = d.alignment_pct;
      matrix[j][i] = d.alignment_pct;
    }
  }

  // For the selected pair, find the underlying distance record for detail display
  const selectedDetail = selectedCell
    ? distances.find(
        (d) =>
          (d.from_label === labels[selectedCell.i] && d.to_label === labels[selectedCell.j]) ||
          (d.from_label === labels[selectedCell.j] && d.to_label === labels[selectedCell.i]),
      )
    : null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-[#86958d] group relative inline-block">
        Cell values show alignment percentage — higher (biolume green) means more cognitively similar.
        <span className="ml-1 text-[#b3c2ba] cursor-help border-b border-dotted border-[#62706a]">
          Diagonal is always 100% (self).
        </span>
        <span className="invisible group-hover:visible absolute left-0 top-full mt-1 z-10 w-72 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3 text-xs text-[#b3c2ba]">
          A model compared to itself always shows 100% alignment. This is the baseline —
          all other percentages show how much two DIFFERENT models diverge.
        </span>
      </p>

      <div className="overflow-x-auto">
        <div
          className="inline-grid gap-1"
          style={{
            gridTemplateColumns: `auto repeat(${n}, minmax(60px, 1fr))`,
          }}
        >
          {/* Header row */}
          <div />
          {labels.map((label) => (
            <div
              key={`h-${label}`}
              className="px-2 py-1.5 font-['Geist_Mono'] text-[11px] font-medium text-[#86958d] text-center truncate"
            >
              {label}
            </div>
          ))}

          {/* Data rows */}
          {labels.map((rowLabel, i) => (
            <Fragment key={rowLabel}>
              <div
                className="px-2 py-1.5 font-['Geist_Mono'] text-[11px] font-medium text-[#86958d] flex items-center"
              >
                {rowLabel}
              </div>
              {labels.map((_, j) => {
                const val = matrix[i][j];
                const isDiag = i === j;
                return (
                  <button
                    key={`${i}-${j}`}
                    onClick={() => !isDiag && setSelectedCell({ i, j })}
                    disabled={isDiag}
                    className={`flex items-center justify-center px-1 py-2 rounded-[2px] text-[11px] font-['Geist_Mono'] font-bold transition-colors ${
                      isDiag ? 'text-[#62706a] cursor-default' : 'text-[#eaf3ee] cursor-pointer hover:brightness-125'
                    }`}
                    style={{
                      backgroundColor: isDiag ? '#13201c' : cohortColor(val),
                      ...cellBorder(val, isDiag),
                    }}
                  >
                    {isDiag ? '—' : `${val.toFixed(0)}%`}
                  </button>
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>

      {/* Cell detail panel — shows what specific operators differ most */}
      {selectedDetail && selectedCell && (
        <div className="mt-4 rounded-[2px] border border-[#37f5a0]/40 bg-[#13201c] p-4">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h4 className="font-['Space_Grotesk'] text-sm font-semibold text-[#37f5a0]">
              {selectedDetail.from_label} vs {selectedDetail.to_label}
            </h4>
            <button
              onClick={() => setSelectedCell(null)}
              className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] text-[#86958d] hover:text-[#eaf3ee]"
            >
              ✕ close
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3 text-xs mb-2">
            <div>
              <span className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#86958d] block">Alignment</span>
              <span
                className="font-['Geist_Mono'] font-bold"
                style={{ color: cohortColor(selectedDetail.alignment_pct, 'text') }}
              >
                {selectedDetail.alignment_pct.toFixed(1)}%
              </span>
            </div>
            <div>
              <span className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#86958d] block">Bhattacharyya</span>
              <span className="font-['Geist_Mono'] font-bold text-[#eaf3ee]">
                {selectedDetail.bhattacharyya_coefficient.toFixed(4)}
              </span>
            </div>
            <div>
              <span className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#86958d] block">Cognitive Distance</span>
              <span className="font-['Geist_Mono'] font-bold text-[#eaf3ee]">
                {selectedDetail.geodesic_distance.toFixed(4)}
              </span>
            </div>
          </div>
          <p className="text-xs text-[#b3c2ba] leading-relaxed">
            {selectedDetail.alignment_pct >= 95
              ? `These two models are nearly interchangeable — ${selectedDetail.alignment_pct.toFixed(1)}% alignment means their cognitive architectures are almost identical. Pick whichever is faster or cheaper.`
              : selectedDetail.alignment_pct >= 85
              ? `These models share a similar cognitive profile (${selectedDetail.alignment_pct.toFixed(1)}% alignment), but diverge enough on specific operators that outputs will differ on edge cases.`
              : selectedDetail.alignment_pct >= 70
              ? `These models think noticeably differently (${selectedDetail.alignment_pct.toFixed(1)}% alignment). Expect materially different answers on the same prompt — pick based on which cognitive strengths your task needs.`
              : `These models have significantly different cognitive architectures (${selectedDetail.alignment_pct.toFixed(1)}% alignment). They will produce meaningfully different outputs on most non-trivial prompts.`}
          </p>
        </div>
      )}
    </div>
  );
}
