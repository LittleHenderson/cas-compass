import { useState, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card } from '../components/shared/Card';
import { CertBadge } from '../components/shared/CertBadge';
import { postReproducibility } from '../api/endpoints';
import type { ReproducibilityResponse, ReproducibilityRequest } from '../api/endpoints';
import { formatProviderLabel } from '../lib/providerLabels';

const PROVIDERS = ['mock', 'openai', 'anthropic', 'google', 'xai', 'deepseek', 'qwen', 'meta'];

const CERT_COLORS: Record<string, string> = {
  Platinum: '#a78bfa',
  Gold: '#fbbf24',
  Silver: '#94a3b8',
  Bronze: '#f97316',
  Fail: '#ef4444',
};

function StripPlot({ runs, mean, stdDev }: { runs: { composite: number; certification: string }[]; mean: number; stdDev: number }) {
  const min = Math.min(...runs.map(r => r.composite), mean - stdDev * 2);
  const max = Math.max(...runs.map(r => r.composite), mean + stdDev * 2);
  const pad = Math.max(5, (max - min) * 0.15);
  const lo = Math.max(0, min - pad);
  const hi = Math.min(100, max + pad);
  const range = hi - lo || 1;

  const toX = (val: number) => ((val - lo) / range) * 100;

  // Certification bands
  const bands = [
    { label: 'Fail', from: 0, to: 40, color: '#ef444420' },
    { label: 'Bronze', from: 40, to: 60, color: '#f9741620' },
    { label: 'Silver', from: 60, to: 75, color: '#94a3b820' },
    { label: 'Gold', from: 75, to: 90, color: '#fbbf2420' },
    { label: 'Platinum', from: 90, to: 100, color: '#a78bfa20' },
  ];

  return (
    <div className="relative h-28 rounded-[2px] border border-[#20302b] bg-[#13201c] overflow-hidden">
      {/* Certification bands */}
      {bands.map(band => {
        const left = toX(Math.max(band.from, lo));
        const right = toX(Math.min(band.to, hi));
        if (right <= left) return null;
        return (
          <div
            key={band.label}
            className="absolute top-0 bottom-0"
            style={{ left: `${left}%`, width: `${right - left}%`, backgroundColor: band.color }}
          />
        );
      })}

      {/* Std dev range */}
      <div
        className="absolute top-4 bottom-4 rounded-[2px] bg-[#37f5a0]/12 border border-[#37f5a0]/35"
        style={{
          left: `${toX(mean - stdDev)}%`,
          width: `${toX(mean + stdDev) - toX(mean - stdDev)}%`,
        }}
      />

      {/* Mean line */}
      <div
        className="absolute top-2 bottom-2 w-0.5 bg-[#37f5a0]"
        style={{ left: `${toX(mean)}%` }}
      />

      {/* Individual run dots */}
      {runs.map((run, i) => (
        <div
          key={i}
          className="absolute w-2.5 h-2.5 rounded-full border border-[#050b0a]"
          style={{
            left: `${toX(run.composite)}%`,
            top: `${30 + (i % 3) * 18}%`,
            backgroundColor: CERT_COLORS[run.certification] ?? '#86958d',
            transform: 'translateX(-50%)',
          }}
          title={`Run ${i + 1}: ${run.composite.toFixed(1)} (${run.certification})`}
        />
      ))}

      {/* Scale labels */}
      <div className="absolute bottom-1 left-2 text-[10px] text-[#86958d] font-['Geist_Mono']">{lo.toFixed(0)}</div>
      <div className="absolute bottom-1 right-2 text-[10px] text-[#86958d] font-['Geist_Mono']">{hi.toFixed(0)}</div>
      <div
        className="absolute top-1 text-[10px] text-[#37f5a0] font-['Geist_Mono'] font-semibold"
        style={{ left: `${toX(mean)}%`, transform: 'translateX(-50%)' }}
      >
        {mean.toFixed(1)}
      </div>
    </div>
  );
}

export function ReproducibilityPage() {
  const [text, setText] = useState('');
  const [provider, setProvider] = useState('mock');
  const [runs, setRuns] = useState(10);
  const resultRef = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: (req: ReproducibilityRequest) => postReproducibility(req),
    onSuccess() {
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    },
  });

  const result: ReproducibilityResponse | undefined = mutation.data;

  function handleRun() {
    if (!text.trim()) return;
    mutation.mutate({
      text,
      provider,
      mock: provider === 'mock',
      runs,
    });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0] mb-1">
          ◕ Under evaluation · Test-Retest Variance
        </p>
        <h1 className="font-['Space_Grotesk'] text-2xl font-bold tracking-[-0.03em] text-[#eaf3ee] mb-1">Reproducibility Test</h1>
        <p className="text-sm text-[#b3c2ba]">
          Run the same prompt against the same provider N times. Measure test-retest reliability
          of the NCCS scoring engine.
        </p>
      </div>

      <Card title="Configure Test">
        <div className="space-y-4">
          <div>
            <label className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d] mb-1.5">
              Prompt
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Enter the prompt to test for reproducibility..."
              rows={3}
              className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3 text-base sm:text-sm text-[#eaf3ee] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="space-y-1">
              <span className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Provider</span>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-sm text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none min-h-[44px]"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p} className="bg-[#0c1513]">{formatProviderLabel(p)}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Runs</span>
              <input
                type="number"
                min={2}
                max={50}
                value={runs}
                onChange={(e) => setRuns(Math.min(50, Math.max(2, Number(e.target.value))))}
                className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 font-['Geist_Mono'] text-sm text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none min-h-[44px]"
              />
            </label>

            <div className="flex items-end">
              <button
                onClick={handleRun}
                disabled={!text.trim() || mutation.isPending}
                className="w-full rounded-[2px] bg-[#37f5a0] px-4 py-2.5 text-sm font-semibold text-[#050b0a] hover:bg-[#37f5a0]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {mutation.isPending ? `Running ${runs} assessments...` : `Run ${runs}x`}
              </button>
            </div>
          </div>

          {provider !== 'mock' && (
            <p className="text-xs text-[#f59e0b] flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Live API — {runs} calls will be made. Requires API key in .env
            </p>
          )}
        </div>
      </Card>

      {mutation.error && (
        <Card>
          <p className="text-sm text-[#ff7b72]">{(mutation.error as Error).message}</p>
        </Card>
      )}

      {result && (
        <div ref={resultRef} className="space-y-5">
          {/* Stats overview */}
          <Card title="Scoring Reliability">
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 text-center">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Mean NCCS</p>
                  <p className="font-['Space_Grotesk'] text-2xl font-bold text-[#eaf3ee] mt-1">{result.stats.mean}</p>
                </div>
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 text-center">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Std Dev</p>
                  <p className="font-['Space_Grotesk'] text-2xl font-bold text-[#eaf3ee] mt-1">{result.stats.std_dev}</p>
                </div>
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 text-center">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Range</p>
                  <p className="font-['Space_Grotesk'] text-2xl font-bold text-[#eaf3ee] mt-1">{result.stats.range}</p>
                  <p className="font-['Geist_Mono'] text-[10px] text-[#86958d] mt-0.5">{result.stats.min} — {result.stats.max}</p>
                </div>
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 text-center">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">CV</p>
                  <p className="font-['Space_Grotesk'] text-2xl font-bold text-[#eaf3ee] mt-1">{result.stats.coefficient_of_variation}%</p>
                </div>
              </div>

              {/* Certification consistency */}
              <div className="flex items-center gap-3 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3">
                <CertBadge certification={result.stats.dominant_certification} composite={result.stats.mean} />
                <div>
                  <p className="text-sm font-medium text-[#eaf3ee]">
                    {result.stats.certification_consistency}% certification consistency
                  </p>
                  <p className="text-xs text-[#86958d]">
                    {result.stats.certification_consistency === 100
                      ? `All ${result.completed_runs} runs certified ${result.stats.dominant_certification}`
                      : `${Math.round(result.stats.certification_consistency / 100 * result.completed_runs)} of ${result.completed_runs} runs certified ${result.stats.dominant_certification}`}
                  </p>
                </div>
              </div>

              {/* Reliability interpretation */}
              <div className={`rounded-[2px] border p-3 ${
                result.stats.coefficient_of_variation < 3
                  ? 'border-[#37f5a0]/35 bg-[#13201c]'
                  : result.stats.coefficient_of_variation < 8
                    ? 'border-[#f59e0b]/40 bg-[#f59e0b]/10'
                    : 'border-[#ff7b72]/40 bg-[#ff7b72]/10'
              }`}>
                <p className={`font-['Geist_Mono'] text-xs uppercase tracking-[0.08em] font-semibold ${
                  result.stats.coefficient_of_variation < 3
                    ? 'text-[#37f5a0]'
                    : result.stats.coefficient_of_variation < 8
                      ? 'text-[#f59e0b]'
                      : 'text-[#ff7b72]'
                }`}>
                  {result.stats.coefficient_of_variation < 3
                    ? 'High Test-Retest Reliability'
                    : result.stats.coefficient_of_variation < 8
                      ? 'Moderate Test-Retest Reliability'
                      : 'Low Test-Retest Reliability'}
                </p>
                <p className="text-xs text-[#b3c2ba] mt-1">
                  When the same prompt was submitted to {formatProviderLabel(result.provider)} {result.completed_runs} times independently,
                  NCCS scores showed a standard deviation of {result.stats.std_dev} points
                  (CV = {result.stats.coefficient_of_variation}%), demonstrating{' '}
                  {result.stats.coefficient_of_variation < 3 ? 'high' : result.stats.coefficient_of_variation < 8 ? 'moderate' : 'low'}{' '}
                  test-retest reliability.
                </p>
              </div>
            </div>
          </Card>

          {/* Strip plot */}
          <Card title="Score Distribution">
            <div className="space-y-3">
              <StripPlot
                runs={result.runs}
                mean={result.stats.mean}
                stdDev={result.stats.std_dev}
              />
              <div className="flex flex-wrap gap-3 font-['Geist_Mono'] text-[11px] text-[#86958d]">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#37f5a0] inline-block" /> Mean
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-6 h-2 rounded-[2px] bg-[#37f5a0]/15 border border-[#37f5a0]/35 inline-block" /> ±1 Std Dev
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: CERT_COLORS.Gold }} /> Individual Run
                </span>
              </div>
            </div>
          </Card>

          {/* Individual runs table */}
          <Card title={`Individual Runs (${result.completed_runs})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-[#13201c] border-b border-[#20302b] text-[#86958d] font-['Geist_Mono'] uppercase tracking-[0.08em] text-[11px]">
                    <th className="text-left px-2.5 py-2 font-medium">#</th>
                    <th className="text-right px-2.5 py-2 font-medium">NCCS</th>
                    <th className="text-center px-2.5 py-2 font-medium">Cert</th>
                    <th className="text-right px-2.5 py-2 font-medium">Operator</th>
                    <th className="text-right px-2.5 py-2 font-medium">Domain</th>
                    <th className="text-right px-2.5 py-2 font-medium">Drive/RPM</th>
                    <th className="text-right px-2.5 py-2 font-medium">Inversion</th>
                    <th className="text-right px-2.5 py-2 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {result.runs.map((run) => (
                    <tr key={run.run_index} className="border-t border-[#20302b]/60 hover:bg-[#13201c]/70">
                      <td className="px-2.5 py-2 text-[#86958d] font-['Geist_Mono']">{run.run_index + 1}</td>
                      <td className="px-2.5 py-2 text-right font-['Geist_Mono'] font-semibold text-[#eaf3ee]">{run.composite.toFixed(1)}</td>
                      <td className="px-2.5 py-2 text-center">
                        <span
                          className="font-['Geist_Mono'] text-[10px] uppercase tracking-[0.06em] px-1.5 py-0.5 rounded-[2px] font-semibold"
                          style={{
                            backgroundColor: `${CERT_COLORS[run.certification] ?? '#86958d'}20`,
                            color: CERT_COLORS[run.certification] ?? '#eaf3ee',
                          }}
                        >
                          {run.certification}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-right font-['Geist_Mono'] text-[#b3c2ba]">{run.operator_profile.toFixed(1)}</td>
                      <td className="px-2.5 py-2 text-right font-['Geist_Mono'] text-[#b3c2ba]">{run.domain_coherence.toFixed(1)}</td>
                      <td className="px-2.5 py-2 text-right font-['Geist_Mono'] text-[#b3c2ba]">{run.drive_rpm_integrity.toFixed(1)}</td>
                      <td className="px-2.5 py-2 text-right font-['Geist_Mono'] text-[#b3c2ba]">{run.inversion_resistance.toFixed(1)}</td>
                      <td className="px-2.5 py-2 text-right text-[#86958d] font-['Geist_Mono']">{run.elapsed_ms.toFixed(0)}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Citable summary */}
          <Card title="Citable Summary">
            <div className="rounded-[2px] border border-[#20302b] bg-[#050b0a] p-4 font-['Geist_Mono'] text-xs text-[#b3c2ba] leading-relaxed select-all">
              When the same prompt was submitted to {formatProviderLabel(result.provider)} {result.completed_runs} times independently,
              NCCS composite scores ranged from {result.stats.min} to {result.stats.max} (M = {result.stats.mean}, SD = {result.stats.std_dev},
              CV = {result.stats.coefficient_of_variation}%). Certification level was {result.stats.dominant_certification} in{' '}
              {result.stats.certification_consistency}% of trials, demonstrating{' '}
              {result.stats.coefficient_of_variation < 3 ? 'high' : result.stats.coefficient_of_variation < 8 ? 'moderate' : 'low'}{' '}
              test-retest reliability. Total elapsed time: {(result.total_elapsed_ms / 1000).toFixed(1)}s.
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
