import { useState } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { OPERATOR_SHORT } from '../../lib/constants';
import { ExplainPanel } from '../shared/ExplainPanel';
import { interpretAllOperators } from '../../lib/interpretations';
import type { PhenomenologicalRegister } from '../../api/types';

/**
 * CAS v7.5 Phenomenological Register (Clarification 8) human-readable
 * names. Used for the register badge tooltip in the operator details panel.
 * Register is *specification of operational character* — lowercase `f` for
 * Affective is authoritative.
 */
const REGISTER_LABELS: Record<PhenomenologicalRegister, string> = {
  T: 'Transcendent',
  A: 'Analytical',
  f: 'Affective',
  E: 'Embodied',
};

export function OperatorRadarChart({
  scores,
  registers,
}: {
  scores: number[];
  /**
   * CAS v7.5 Register axis. Parallel list with scores; each entry is a
   * register letter or null when the score is register-neutral. Omit or
   * pass null for fully v7.4-compatible rendering.
   */
  registers?: (PhenomenologicalRegister | null)[] | null;
}) {
  const [open, setOpen] = useState(false);

  const data = scores.map((s, i) => ({
    operator: OPERATOR_SHORT[i],
    score: +(s * 100).toFixed(1),
  }));

  const { insights, summary } = interpretAllOperators(scores);

  // Only render register annotations when at least one non-null register
  // is present; keeps v7.4 register-neutral rendering byte-identical.
  const hasAnyRegister = Array.isArray(registers) && registers.some((r) => r != null);

  return (
    <div className="chart-interactive" onClick={() => setOpen(!open)}>
      <div className="animate-chart-in">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="68%">
            <PolarGrid stroke="#20302b" />
            <PolarAngleAxis dataKey="operator" tick={{ fill: '#b3c2ba', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#86958d', fontSize: 9 }} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0c1513', border: '1px solid #20302b', borderRadius: 2, color: '#eaf3ee' }}
            />
            <Radar
              dataKey="score"
              stroke="#37f5a0"
              strokeWidth={2}
              fill="#37f5a0"
              fillOpacity={0.14}
            />
          </RadarChart>
        </ResponsiveContainer>
        <div className="chart-hint text-center font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity">
          Click for operator details
        </div>
      </div>

      <ExplainPanel visible={open} onClose={() => setOpen(false)}>
        <p className="font-medium text-[#eaf3ee]">{summary}</p>
        <div className="mt-2 space-y-2">
          {insights.map((op) => {
            const register = hasAnyRegister ? registers?.[op.index] ?? null : null;
            return (
              <div key={op.index} className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-[#eaf3ee]">{op.label}</span>
                  <span className="flex items-center gap-1.5 font-['Geist_Mono'] text-xs font-bold text-[#37f5a0]">
                    {register && (
                      <span
                        data-testid={`register-badge-${op.index}`}
                        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-1.5 py-0.5 text-[10px] font-medium text-[#eaf3ee]"
                        title={`CAS v7.5 Register: ${REGISTER_LABELS[register]}`}
                      >
                        |{register}
                      </span>
                    )}
                    {(op.score * 100).toFixed(0)}%
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#b3c2ba]">{op.description}</p>
                {op.pairNote && (
                  <p className="mt-0.5 text-xs text-[#f59e0b]">{op.pairNote}</p>
                )}
              </div>
            );
          })}
        </div>
      </ExplainPanel>
    </div>
  );
}
