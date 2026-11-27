/**
 * DomainCoherenceRadar — Recharts radar showing the 4 processing domains
 * with business-friendly labels and a DCI (Processing Balance) indicator.
 */

import { useState } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { DOMAIN_COLORS } from '../../lib/colors';
import { ExplainPanel } from '../shared/ExplainPanel';
import { TranslatedMetric } from '../shared/TranslatedMetric';
import { translateDomainCoherence } from '../../lib/translations';
import type { WrapResult } from '../../api/types';

const DOMAIN_DESCRIPTIONS: string[] = [
  'Principled: Value-driven reasoning, ethical foundations, and guiding principles.',
  'Cognitive: Abstract thinking, pattern recognition, and knowledge construction.',
  'Evaluative: Judgment, decision-making, and quality assessment.',
  'Operational: Execution, implementation, and practical action.',
];

export function DomainCoherenceRadar({ result }: { result: WrapResult }) {
  const [open, setOpen] = useState(false);

  const dc = translateDomainCoherence(result);
  if (!dc) return null;

  const data = dc.domains.map((d, i) => ({
    domain: d.name,
    value: d.value,
    fill: DOMAIN_COLORS[i],
  }));

  const weakest = dc.domains.reduce((a, b) => a.value < b.value ? a : b);
  const strongest = dc.domains.reduce((a, b) => a.value > b.value ? a : b);

  return (
    <div className="chart-interactive" onClick={() => setOpen(!open)}>
      <div className="animate-chart-in">
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="65%">
            <PolarGrid stroke="#20302b" />
            <PolarAngleAxis
              dataKey="domain"
              tick={{ fill: '#b3c2ba', fontSize: 11, fontWeight: 500 }}
            />
            <PolarRadiusAxis
              domain={[0, Math.max(40, ...data.map(d => d.value))]}
              tick={{ fill: '#86958d', fontSize: 9 }}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#0c1513',
                border: '1px solid #20302b',
                borderRadius: 2,
                color: '#eaf3ee',
              }}
              formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Strength']}
            />
            <Radar
              dataKey="value"
              stroke="#37f5a0"
              strokeWidth={2}
              fill="#37f5a0"
              fillOpacity={0.14}
            />
          </RadarChart>
        </ResponsiveContainer>

        {/* Processing Balance indicator */}
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="font-['Geist_Mono'] text-[11px] text-[#86958d] uppercase tracking-[0.08em]">Processing Balance</span>
          <span
            className="font-['Geist_Mono'] text-xs font-bold"
            style={{ color: dc.dci.severityColor }}
          >
            {dc.dci.displayValue}
          </span>
        </div>

        <div className="chart-hint text-center font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity mt-1">
          Click for domain details
        </div>
      </div>

      <ExplainPanel visible={open} onClose={() => setOpen(false)}>
        <p className="font-medium text-[#eaf3ee] mb-3">
          Strongest: {strongest.name} ({strongest.pct}). Weakest: {weakest.name} ({weakest.pct}).
        </p>

        <TranslatedMetric metric={dc.dci} />

        <div className="mt-3 space-y-2">
          {dc.domains.map((d, i) => (
            <div key={d.name} className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: DOMAIN_COLORS[i] }} />
                  <span className="text-xs font-semibold text-[#eaf3ee]">{d.name}</span>
                </div>
                <span className="font-['Geist_Mono'] text-xs font-bold" style={{ color: DOMAIN_COLORS[i] }}>
                  {d.pct}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-[#b3c2ba]">{DOMAIN_DESCRIPTIONS[i]}</p>
            </div>
          ))}
        </div>
      </ExplainPanel>
    </div>
  );
}
