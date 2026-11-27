import { useState } from 'react';
import { PieChart, Pie, Cell } from 'recharts';
import { certColor, GAUGE_GRADIENT } from '../../lib/colors';
import { ExplainPanel } from '../shared/ExplainPanel';
import { interpretNccs } from '../../lib/interpretations';
import type { NccsResult } from '../../api/types';

export function NccsGauge({
  composite,
  certification,
  nccs,
}: {
  composite: number;
  certification: string;
  nccs?: NccsResult;
}) {
  const [open, setOpen] = useState(false);
  const color = certColor(certification);
  const gradientId = 'nccs-gauge-gradient';
  const data = [
    { value: composite },
    { value: 100 - composite },
  ];

  const insight = nccs ? interpretNccs(nccs) : null;

  return (
    <div className="chart-interactive" onClick={() => nccs && setOpen(!open)}>
      <div className="flex flex-col items-center animate-chart-in">
        <PieChart width={220} height={130}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              {GAUGE_GRADIENT.map((stop) => (
                <stop key={stop.offset} offset={stop.offset} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
          <Pie
            data={data}
            cx={110}
            cy={110}
            startAngle={180}
            endAngle={0}
            innerRadius={65}
            outerRadius={95}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={`url(#${gradientId})`} />
            <Cell fill="#13201c" />
          </Pie>
        </PieChart>
        <div className="-mt-6 text-center">
          <div
            className="font-['Space_Grotesk'] text-4xl font-bold tracking-[-0.03em]"
            style={{ color }}
          >
            {composite.toFixed(1)}
          </div>
          <div className="mt-1 font-['Geist_Mono'] text-[11px] font-medium uppercase tracking-[0.08em] text-[#86958d]">
            NCCS Composite
          </div>
        </div>
        {nccs && (
          <div className="chart-hint mt-2 font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity">
            Click for details
          </div>
        )}
      </div>

      {insight && (
        <ExplainPanel visible={open} onClose={() => setOpen(false)}>
          <p className="font-medium text-[#eaf3ee]">{insight.summary}</p>
          <p>{insight.topStrength}</p>
          <p>{insight.biggestGap}</p>
          <p className="text-[#37f5a0]">{insight.recommendation}</p>
        </ExplainPanel>
      )}
    </div>
  );
}
