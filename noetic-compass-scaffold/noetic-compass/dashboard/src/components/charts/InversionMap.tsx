import { useState } from 'react';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { INVERSION_AXIS_LABELS } from '../../lib/constants';
import { interpretInversion, interpretStealth } from '../../lib/interpretations';

/** Rich tooltip that shows axis description + verdict on hover. */
function AxisTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { axis: string; resistance: number; description: string; verdict: string } }> }) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="max-w-xs rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3">
      <div className="flex items-center justify-between gap-3 mb-1">
        <span className="font-['Space_Grotesk'] text-xs font-semibold text-[#eaf3ee]">{d.axis}</span>
        <span className="font-['Geist_Mono'] text-xs font-bold text-[#37f5a0]">{d.resistance}%</span>
      </div>
      <p className="text-xs text-[#b3c2ba] leading-relaxed">{d.description}</p>
      <p className="text-[11px] text-[#86958d] mt-1.5 italic">{d.verdict}</p>
    </div>
  );
}

export function InversionMap({
  axisScores,
  stealthResistance,
}: {
  axisScores: number[];
  stealthResistance: number;
}) {
  // Always-visible detail panel state. Default open so first-time users see every axis.
  const [showDetails, setShowDetails] = useState(true);
  const [expandedAxis, setExpandedAxis] = useState<number | null>(null);

  const insights = axisScores.map((s, i) => interpretInversion(i, s));
  const stealthNote = interpretStealth(stealthResistance);

  // Chart data now carries description + verdict for the rich hover tooltip.
  const data = axisScores.map((s, i) => ({
    axis: INVERSION_AXIS_LABELS[i].split(':')[0],
    resistance: +(s * 100).toFixed(1),
    description: insights[i].description,
    verdict: insights[i].verdict,
  }));

  function scoreColor(score: number): string {
    if (score >= 0.6) return 'text-[#37f5a0]';
    if (score >= 0.4) return 'text-[#f59e0b]';
    return 'text-[#ff7b72]';
  }

  function scoreBarColor(score: number): string {
    if (score >= 0.6) return '#37f5a0';
    if (score >= 0.4) return '#f59e0b';
    return '#ff7b72';
  }

  return (
    <div>
      <div className="animate-chart-in">
        <ResponsiveContainer width="100%" height={260}>
          <RadarChart data={data} cx="50%" cy="50%" outerRadius="65%">
            <PolarGrid stroke="#20302b" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: '#b3c2ba', fontSize: 11 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: '#86958d', fontSize: 9 }} axisLine={false} />
            <Tooltip content={<AxisTooltip />} />
            <Radar
              dataKey="resistance"
              stroke="#ff7b72"
              strokeWidth={2}
              fill="#ff7b72"
              fillOpacity={0.14}
            />
          </RadarChart>
        </ResponsiveContainer>
        <div className="font-['Geist_Mono'] text-xs text-[#86958d] text-center font-medium">
          Stealth Resistance: <span className="text-[#ff7b72]">{(stealthResistance * 100).toFixed(1)}%</span>
        </div>
      </div>

      {/* Always-visible axis details — click each card to expand the full description.
          This replaces the click-the-chart-to-open hidden panel that users weren't discovering. */}
      <div className="mt-4 pt-4 border-t border-[#20302b]">
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center justify-between w-full text-left min-h-[36px]"
        >
          <span className="font-['Geist_Mono'] text-[11px] font-semibold uppercase tracking-[0.08em] text-[#37f5a0]">
            {showDetails ? '▾' : '▸'} Read About Each Inversion ({axisScores.length})
          </span>
          <span className="text-[11px] text-[#86958d]">Hover chart for tooltip · click cards below for detail</span>
        </button>

        {showDetails && (
          <div className="mt-3 space-y-2 animate-slide-down">
            {insights.map((inv) => {
              const isOpen = expandedAxis === inv.index;
              const pct = Math.round(inv.score * 100);
              return (
                <div
                  key={inv.index}
                  className="rounded-[2px] border border-[#20302b] bg-[#13201c] overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedAxis(isOpen ? null : inv.index)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left min-h-[44px] hover:bg-[#0c1513] transition-colors"
                  >
                    <span className="text-xs font-semibold text-[#eaf3ee] w-28 shrink-0">{inv.label}</span>
                    {/* Inline resistance bar */}
                    <div className="flex-1 h-1.5 rounded-[2px] bg-[#0c1513] overflow-hidden">
                      <div
                        className="h-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: scoreBarColor(inv.score) }}
                      />
                    </div>
                    <span className={`font-['Geist_Mono'] text-xs font-bold w-10 text-right ${scoreColor(inv.score)}`}>
                      {pct}%
                    </span>
                    <svg
                      width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
                      className={`text-[#86958d] shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3 pt-2 border-t border-[#20302b] space-y-1.5">
                      <p className="text-xs text-[#b3c2ba] leading-relaxed">{inv.description}</p>
                      <p className="text-xs text-[#86958d] italic">{inv.verdict}</p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Stealth detection footer */}
            <div className="rounded-[2px] border border-[#ff7b72]/40 bg-[#ff7b72]/10 px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-['Geist_Mono'] text-xs uppercase tracking-[0.06em] font-semibold text-[#ff7b72]">Stealth Detection</span>
                <span className="font-['Geist_Mono'] text-xs font-bold text-[#ff7b72]">
                  {(stealthResistance * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-[#b3c2ba] leading-relaxed">{stealthNote}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
