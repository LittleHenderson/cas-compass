import { Fragment, useMemo, useRef, useState } from 'react';
import { DOMAIN_SHORT, OPERATOR_SHORT } from '../../lib/constants';
import { ExplainPanel } from '../shared/ExplainPanel';
import { interpretState } from '../../lib/interpretations';

/* ── Thermal color mapping ─────────────────────────────────────────── */

interface HeatStyle {
  bg: string;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(c1: [number, number, number], c2: [number, number, number], t: number): string {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},${Math.round(lerp(c1[1], c2[1], t))},${Math.round(lerp(c1[2], c2[2], t))})`;
}

const STOPS: { at: number; rgb: [number, number, number] }[] = [
  { at: 0.0,  rgb: [12, 21, 19] },     // #0c1513 ground card
  { at: 0.2,  rgb: [19, 38, 33] },     // deep forest
  { at: 0.4,  rgb: [24, 78, 62] },     // muted biolume
  { at: 0.6,  rgb: [36, 152, 110] },   // mid emerald
  { at: 0.78, rgb: [55, 245, 160] },   // #37f5a0 biolume accent
  { at: 0.9,  rgb: [245, 158, 11] },   // #f59e0b warn amber
  { at: 1.0,  rgb: [254, 243, 199] },  // hot cream highlight
];

function heatColor(intensity: number): HeatStyle {
  const v = Math.max(0, Math.min(1, intensity));
  for (let i = 1; i < STOPS.length; i++) {
    if (v <= STOPS[i].at) {
      const t = (v - STOPS[i - 1].at) / (STOPS[i].at - STOPS[i - 1].at);
      return {
        bg: lerpColor(STOPS[i - 1].rgb, STOPS[i].rgb, t),
      };
    }
  }
  const last = STOPS[STOPS.length - 1];
  return { bg: lerpColor(last.rgb, last.rgb, 1) };
}

/* ── Component ─────────────────────────────────────────────────────── */

export function StateHeatmap({
  operatorScores,
  domainAverages,
}: {
  operatorScores: number[];
  domainAverages: number[];
}) {
  const [selected, setSelected] = useState<{ d: number; o: number } | null>(null);
  const [hovered, setHovered] = useState<{ d: number; o: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  /* Compute all 40 intensities, normalize to [0,1], then rank */
  const { cellGrid, rowAvgs, colAvgs, strongestRow, weakestRow, strongestCol, weakestCol } =
    useMemo(() => {
      /* 1. Raw intensities */
      const raw: number[][] = []; // raw[d][o]
      let minI = Infinity, maxI = -Infinity;
      for (let d = 0; d < 4; d++) {
        raw[d] = [];
        for (let o = 0; o < 10; o++) {
          const v = domainAverages[d] * operatorScores[o];
          raw[d][o] = v;
          if (v < minI) minI = v;
          if (v > maxI) maxI = v;
        }
      }

      /* 2. Normalize to [0,1] so full thermal spectrum is used.
         Raw values are tiny (domainAverages sum to 1 → each ~0.25) so without
         this every cell lands in the same dark band. */
      const range = maxI - minI || 1;
      const cellGrid: number[][] = [];
      for (let d = 0; d < 4; d++) {
        cellGrid[d] = [];
        for (let o = 0; o < 10; o++) {
          cellGrid[d][o] = (raw[d][o] - minI) / range;
        }
      }

      /* 3. Row/col averages from normalized values so bars match cell colors */
      const rowAvgs = cellGrid.map((row) => row.reduce((s, v) => s + v, 0) / 10);
      const colAvgs = Array.from({ length: 10 }, (_, o) =>
        cellGrid.reduce((s, row) => s + row[o], 0) / 4,
      );

      /* 4. Strongest/weakest row & col */
      let strongestRow = 0, weakestRow = 0;
      let strongestCol = 0, weakestCol = 0;
      for (let i = 1; i < 4; i++) {
        if (rowAvgs[i] > rowAvgs[strongestRow]) strongestRow = i;
        if (rowAvgs[i] < rowAvgs[weakestRow]) weakestRow = i;
      }
      for (let i = 1; i < 10; i++) {
        if (colAvgs[i] > colAvgs[strongestCol]) strongestCol = i;
        if (colAvgs[i] < colAvgs[weakestCol]) weakestCol = i;
      }

      return { cellGrid, rowAvgs, colAvgs, strongestRow, weakestRow, strongestCol, weakestCol };
    }, [operatorScores, domainAverages]);

  const insight = selected
    ? interpretState(selected.d, selected.o, domainAverages[selected.d], operatorScores[selected.o])
    : null;

  return (
    <div className="chart-interactive">
      <div className="overflow-x-auto animate-chart-in relative" ref={gridRef}>
        {/* ── Main grid: label + 10 cells + row summary ── */}
        <div
          className="inline-grid gap-1 relative"
          style={{ gridTemplateColumns: 'auto repeat(10, 40px) 80px' }}
        >
          {/* Header row: empty + operator labels + "Avg" */}
          <div />
          {OPERATOR_SHORT.map((op) => (
            <div key={op} className="px-0.5 py-0.5 text-center font-['Geist_Mono'] text-[10px] text-[#86958d] font-medium truncate">
              {op}
            </div>
          ))}
          <div className="px-1 py-0.5 text-center font-['Geist_Mono'] text-[10px] text-[#86958d] font-medium">Avg</div>

          {/* 4 domain rows */}
          {DOMAIN_SHORT.map((domain, di) => (
            <Fragment key={domain}>
              {/* Row label */}
              <div className="px-2 py-1 font-['Geist_Mono'] text-xs font-medium text-[#b3c2ba] flex items-center">
                {domain}
              </div>

              {/* 10 cells */}
              {operatorScores.map((_opScore, oi) => {
                const normalized = cellGrid[di][oi]; // 0-1 for color mapping
                const rawScore = domainAverages[di] * operatorScores[oi]; // original for display
                const score10 = (rawScore * 10).toFixed(1);
                const key = `${di}-${oi}`;
                const isSelected = selected?.d === di && selected?.o === oi;
                const heat = heatColor(normalized);

                return (
                  <div
                    key={key}
                    className="w-10 h-10 rounded-[2px] cursor-pointer transition-transform duration-150 hover:scale-105 hover:brightness-110 hover:z-10 relative border border-[#20302b]"
                    style={{
                      backgroundColor: heat.bg,
                      boxShadow: isSelected ? 'inset 0 0 0 2px #eaf3ee' : undefined,
                    }}
                    title={`${domain}${oi}: ${score10}/10`}
                    onMouseEnter={() => setHovered({ d: di, o: oi })}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => setSelected(isSelected ? null : { d: di, o: oi })}
                  >
                    {/* Score overlay for hot cells */}
                    {normalized >= 0.7 && (
                      <span className="absolute inset-0 flex items-center justify-center font-['Geist_Mono'] text-[9px] font-bold text-[#050b0a] pointer-events-none">
                        {score10}
                      </span>
                    )}
                  </div>
                );
              })}

              {/* Row summary: mini bar + percentage */}
              <div className="flex items-center gap-1 px-1">
                <div className="w-10 h-2 rounded-[2px] overflow-hidden bg-[#13201c] border border-[#20302b]">
                  <div
                    className="h-full transition-all duration-300"
                    style={{
                      width: `${Math.min(100, rowAvgs[di] * 100)}%`,
                      backgroundColor: heatColor(rowAvgs[di]).bg,
                    }}
                  />
                </div>
                <span
                  className="text-[10px] font-['Geist_Mono'] font-medium"
                  style={{ color: di === strongestRow ? '#37f5a0' : di === weakestRow ? '#ff7b72' : '#b3c2ba' }}
                >
                  {(rowAvgs[di] * 100).toFixed(0)}%
                </span>
              </div>
            </Fragment>
          ))}
        </div>

        {/* ── Column summaries ── */}
        <div
          className="inline-grid gap-1 mt-1"
          style={{ gridTemplateColumns: 'auto repeat(10, 40px) 80px' }}
        >
          <div className="px-2 font-['Geist_Mono'] text-[10px] text-[#86958d]">Avg</div>
          {colAvgs.map((avg: number, oi: number) => (
            <div key={oi} className="flex flex-col items-center gap-0.5">
              <div className="w-2 h-5 rounded-[2px] overflow-hidden bg-[#13201c] border border-[#20302b]">
                <div
                  className="w-full transition-all duration-300"
                  style={{
                    height: `${Math.min(100, avg * 100)}%`,
                    backgroundColor: heatColor(avg).bg,
                    marginTop: `${100 - Math.min(100, avg * 100)}%`,
                  }}
                />
              </div>
              <span
                className="text-[9px] font-['Geist_Mono']"
                style={{ color: oi === strongestCol ? '#37f5a0' : oi === weakestCol ? '#ff7b72' : '#86958d' }}
              >
                {(avg * 100).toFixed(0)}
              </span>
            </div>
          ))}
          <div />
        </div>

        {/* ── Legend bar ── */}
        <div className="mt-3 px-1">
          <div
            className="h-2 rounded-[2px] border border-[#20302b]"
            style={{
              background: 'linear-gradient(to right, #0c1513, #132621, #184e3e, #24986e, #37f5a0, #f59e0b, #fef3c7)',
            }}
          />
          <div className="flex justify-between mt-1 font-['Geist_Mono'] text-[10px]">
            <span className="text-[#86958d]">Low</span>
            <span className="text-[#37f5a0]">Active</span>
            <span className="text-[#f59e0b]">Peak</span>
          </div>
        </div>

        {/* ── Hover tooltip ── */}
        {hovered && (
          <div
            className="absolute z-20 px-2 py-1 rounded-[2px] text-[11px] font-['Geist_Mono'] pointer-events-none border border-[#20302b] bg-[#0c1513] text-[#eaf3ee]"
            style={{
              /* Position relative to grid — sits above the hovered cell */
              left: `calc(${hovered.o * 44 + 44}px)`,
              top: `calc(${hovered.d * 44 + 12}px)`,
            }}
          >
            {DOMAIN_SHORT[hovered.d]}{hovered.o} ={' '}
            <span className="text-[#37f5a0] font-bold">
              {(domainAverages[hovered.d] * operatorScores[hovered.o] * 10).toFixed(1)}
            </span>
            /10
          </div>
        )}

        {/* ── Hint text ── */}
        <div className="chart-hint mt-1 text-center font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity">
          Click a cell for details
        </div>
      </div>

      {/* ── Explain panel ── */}
      {insight && (
        <ExplainPanel visible={true} onClose={() => setSelected(null)}>
          <p className="font-medium text-[#eaf3ee]">
            State {insight.state}: {insight.operator} / {insight.domain}
          </p>
          <p>
            Intensity:{' '}
            <span className="font-['Geist_Mono'] font-bold text-[#eaf3ee]">
              {(insight.intensity * 100).toFixed(1)}%
            </span>
          </p>
          <p>{insight.description}</p>
        </ExplainPanel>
      )}
    </div>
  );
}
