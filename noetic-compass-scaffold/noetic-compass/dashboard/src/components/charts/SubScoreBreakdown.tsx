import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import type { NccsResult } from '../../api/types';
import { NCCS_WEIGHTS } from '../../lib/constants';
import { ExplainPanel } from '../shared/ExplainPanel';
import { interpretSubScore } from '../../lib/interpretations';

const BARS = [
  { key: 'operator_profile' as const, label: 'Operator', color: '#818cf8' },
  { key: 'domain_coherence' as const, label: 'Domain', color: '#60a5fa' },
  { key: 'drive_rpm_integrity' as const, label: 'Drive/RPM', color: '#34d399' },
  { key: 'pathway_quality' as const, label: 'Pathway', color: '#fbbf24' },
  { key: 'inversion_resistance' as const, label: 'Inversion', color: '#f87171' },
  { key: 'social_engineering' as const, label: 'Social Eng.', color: '#f472b6' },
];

export function SubScoreBreakdown({ nccs }: { nccs: NccsResult }) {
  const [selected, setSelected] = useState<number | null>(null);

  // Filter out unmeasured sub-scores (null values)
  const activeBars = BARS.filter((b) => nccs[b.key] != null);

  const data = activeBars.map((b) => {
    const raw = nccs[b.key] ?? 0;
    // Engine returns sub-scores in 0-1; scale to 0-100 for display
    const score = typeof raw === 'number' && raw <= 1.0 ? raw * 100 : (raw as number);
    return {
      name: `${b.label} (${(NCCS_WEIGHTS[b.key] * 100).toFixed(0)}%)`,
      score,
      color: b.color,
    };
  });

  const insight = selected !== null && activeBars[selected]
    ? interpretSubScore(activeBars[selected].key, activeBars[selected].label, data[selected]?.score ?? 0, NCCS_WEIGHTS[activeBars[selected].key] * 100)
    : null;

  return (
    <div className="chart-interactive">
      <div className="animate-chart-in">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fill: '#86958d', fontSize: 10 }} axisLine={{ stroke: '#20302b' }} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fill: '#b3c2ba', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: '#0c1513', border: '1px solid #20302b', borderRadius: 2, color: '#eaf3ee' }}
              cursor={{ fill: 'rgba(55,245,160,0.06)' }}
            />
            <Bar
              dataKey="score"
              barSize={14}
              radius={[0, 2, 2, 0]}
              onClick={(_, index) => setSelected(selected === index ? null : index)}
              className="cursor-pointer"
            >
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.color}
                  fillOpacity={selected === null || selected === i ? 0.9 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="chart-hint text-center font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity">
          Click a bar for details
        </div>
      </div>

      {insight && (
        <ExplainPanel visible={true} onClose={() => setSelected(null)}>
          <p className="font-medium text-[#eaf3ee]">{insight.label} ({insight.weight}% of composite)</p>
          <p>{insight.description}</p>
          <p>Score: <span className="font-['Geist_Mono'] font-bold text-[#eaf3ee]">{insight.score.toFixed(1)}</span> — {insight.verdict}</p>
        </ExplainPanel>
      )}
    </div>
  );
}
