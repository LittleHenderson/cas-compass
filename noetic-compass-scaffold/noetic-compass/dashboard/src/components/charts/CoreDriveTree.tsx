import { useState } from 'react';
import { DRIVE_LABELS } from '../../lib/constants';
import { DRIVE_COLORS } from '../../lib/colors';
import { ExplainPanel } from '../shared/ExplainPanel';
import { interpretDrive } from '../../lib/interpretations';

export function CoreDriveTree({ driveScores }: { driveScores: number[] }) {
  const [selected, setSelected] = useState<number | null>(null);

  const data = driveScores.map((s, i) => ({
    name: DRIVE_LABELS[i],
    score: +(s * 100).toFixed(1),
    color: DRIVE_COLORS[i],
  }));

  const maxScore = Math.max(...data.map(d => d.score), 1);

  const insight = selected !== null ? interpretDrive(selected, driveScores) : null;

  return (
    <div>
      <div className="animate-chart-in space-y-2.5 px-1">
        {data.map((d, i) => (
          <div
            key={i}
            className="space-y-1 cursor-pointer rounded-[2px] px-1.5 py-1 transition-colors hover:bg-[#13201c]"
            onClick={() => setSelected(selected === i ? null : i)}
          >
            <div className="flex items-center justify-between">
              <span className={`text-xs font-medium truncate pr-2 ${selected === i ? 'text-[#eaf3ee]' : 'text-[#b3c2ba]'}`}>
                {d.name}
              </span>
              <span className="font-['Geist_Mono'] text-xs font-bold text-[#eaf3ee] tabular-nums">{d.score.toFixed(1)}</span>
            </div>
            <div className="h-2 w-full rounded-[2px] bg-[#13201c] border border-[#20302b] overflow-hidden">
              <div
                className="h-full transition-all duration-500 ease-out"
                style={{
                  width: `${(d.score / maxScore) * 100}%`,
                  backgroundColor: d.color,
                }}
              />
            </div>
          </div>
        ))}
        <div className="chart-hint text-center font-['Geist_Mono'] text-[10px] text-[#86958d] opacity-0 transition-opacity">
          Click a bar for details
        </div>
      </div>

      {insight && (
        <ExplainPanel visible={true} onClose={() => setSelected(null)}>
          <p className="font-medium text-[#eaf3ee]">{insight.label}</p>
          <p>{insight.description}</p>
          <p>
            Score: <span className="font-['Geist_Mono'] font-bold text-[#eaf3ee]">{(insight.score * 100).toFixed(1)}%</span>
          </p>
          {insight.pairNote && (
            <p className="text-[#f59e0b]">{insight.pairNote}</p>
          )}
        </ExplainPanel>
      )}
    </div>
  );
}
