import type { FractalAnalysis } from '../../api/types';
import { OPERATOR_LABELS } from '../../lib/constants';

const CLASS_BADGES: Record<string, { color: string; label: string; description: string }> = {
  stabilizing: {
    color: '#37f5a0',
    label: 'Stabilizing',
    description: 'Reasoning converges toward a stable conclusion.',
  },
  amplifying: {
    color: '#ff7b72',
    label: 'Amplifying',
    description: 'Reasoning escalates without self-regulation. Watch for runaway conclusions.',
  },
  oscillatory: {
    color: '#f59e0b',
    label: 'Oscillatory',
    description: 'Reasoning cycles between positions rather than converging.',
  },
  neutral: {
    color: '#86958d',
    label: 'Neutral',
    description: 'Identity pattern — no dominant fractal structure detected.',
  },
};

const NODE_COLORS = [
  '#37f5a0', '#60a5fa', '#a78bfa', '#f472b6', '#37f5a0',
  '#f59e0b', '#818cf8', '#ff7b72', '#38bdf8', '#fb923c',
];

export function FractalCard({ analysis }: { analysis: FractalAnalysis }) {
  const badge = CLASS_BADGES[analysis.classification] ?? CLASS_BADGES.neutral;

  return (
    <div className="space-y-4">
      {/* Classification badge */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="inline-flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] font-semibold"
          style={{ color: badge.color, backgroundColor: `${badge.color}14`, border: `1px solid ${badge.color}45` }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: badge.color }} />
          {badge.label}
        </span>
        <span className="text-xs text-[#b3c2ba]">{badge.description}</span>
      </div>

      {/* Operator sequence visualization */}
      <div className="flex items-center gap-1 flex-wrap">
        {analysis.canonical_form.map((op, i) => {
          const label = OPERATOR_LABELS[op]?.split(': ')[1] ?? `CO-${op}`;
          return (
            <div key={i} className="flex items-center gap-1">
              <div
                className="w-8 h-8 rounded-[2px] flex items-center justify-center font-['Geist_Mono'] text-[11px] font-bold border"
                style={{
                  color: NODE_COLORS[op],
                  backgroundColor: `${NODE_COLORS[op]}14`,
                  borderColor: `${NODE_COLORS[op]}45`,
                }}
                title={`CO-${op}: ${label}`}
              >
                {op}
              </div>
              {i < analysis.canonical_form.length - 1 && (
                <svg width="12" height="8" className="text-[#62706a] shrink-0">
                  <path d="M0 4h8m-3-3l3 3-3 3" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] py-2.5 text-center">
          <p className="font-['Space_Grotesk'] text-lg font-bold text-[#eaf3ee]">{analysis.orbit_length}</p>
          <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#86958d]">Orbit Length</p>
        </div>
        <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] py-2.5 text-center">
          <p className="font-['Space_Grotesk'] text-lg font-bold" style={{ color: analysis.cancellations_detected > 0 ? '#ff7b72' : '#37f5a0' }}>
            {analysis.cancellations_detected}
          </p>
          <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#86958d]">Contradictions</p>
        </div>
        <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] py-2.5 text-center">
          <p className="font-['Space_Grotesk'] text-lg font-bold" style={{ color: analysis.has_fixed_point ? '#37f5a0' : '#f59e0b' }}>
            {analysis.has_fixed_point ? 'Yes' : 'No'}
          </p>
          <p className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.08em] text-[#86958d]">Fixed Point</p>
        </div>
      </div>

      {analysis.cancellations_detected > 0 && (
        <p className="text-xs text-[#ff7b72] leading-relaxed">
          {analysis.cancellations_detected} self-contradiction{analysis.cancellations_detected !== 1 ? 's' : ''} detected
          — the AI asserted something then immediately reversed it. This is a structural coherence issue.
        </p>
      )}
    </div>
  );
}
