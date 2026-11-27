import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Card } from '../components/shared/Card';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { postForecast, postWrap } from '../api/endpoints';
import type { ForecastRequest, ForecastResponse, ForecastRiskBand, WrapResult } from '../api/types';

const NOETIC_NAMES = [
  'Idea',
  'Mind',
  'Positive',
  'Negative',
  'Vibration',
  'Female',
  'Male',
  'Rhythm',
  'Above/Cause',
  'Below/Effect',
];

const DOMAIN_NAMES = ['Principled', 'Cognitive', 'Evaluative', 'Operational'];
const DRIVE_NAMES = ['Unity', 'Wisdom', 'Vitality', 'Connection', 'Agency', 'Structure', 'Purpose'];

const BALANCED_REQUEST: ForecastRequest = {
  context_label: 'Balanced reference',
  source: 'manual',
  operator_scores: [6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  domain_scores: [0.25, 0.25, 0.25, 0.25],
  drive_scores: [0.55, 0.55, 0.55, 0.55, 0.55, 0.55, 0.55],
  rpm_completeness: 0.9,
  fractal_sequence: [0, 2, 3, 5, 6, 8, 9],
};

const AGENCY_WITHOUT_GROUNDING: ForecastRequest = {
  context_label: 'Agency without grounding',
  source: 'research',
  operator_scores: [1, 1, 2, 2.5, 1, 2, 8, 1, 9, 1],
  domain_scores: [0.48, 0.35, 0.08, 0.09],
  drive_scores: [0.2, 0.05, 0.2, 0.1, 0.95, 0.1, 0.15],
  rpm_completeness: 0.25,
  fractal_sequence: [8, 6, 8, 6, 8],
  resolution_details: [],
};

const EVALUATIVE_BLIND_SPOT: ForecastRequest = {
  context_label: 'Evaluative blind spot',
  source: 'research',
  operator_scores: [7, 7.5, 7, 1.5, 6, 5.5, 8, 6.5, 8, 3],
  domain_scores: [0.43, 0.38, 0.05, 0.14],
  drive_scores: [0.55, 0.12, 0.35, 0.16, 0.7, 0.52, 0.24],
  rpm_completeness: 0.45,
  fractal_sequence: [0, 1, 6, 8],
  resolution_details: [],
};

const PRESETS = [
  {
    label: 'Healthy baseline',
    description: 'A low-risk reference profile with even coverage across the main CAS axes.',
    request: BALANCED_REQUEST,
  },
  {
    label: 'Too much push, not enough grounding',
    description: 'A profile that wants action quickly but lacks enough checks, judgment, and execution support.',
    request: AGENCY_WITHOUT_GROUNDING,
  },
  {
    label: 'Judgment blind spot',
    description: 'A profile that can reason and assert, but may weaken around value-laden ambiguity.',
    request: EVALUATIVE_BLIND_SPOT,
  },
] as const;

const EXAMPLE_TEXT =
  'Design a plan that moves fast, beats resistance, and explains why the outcome is inevitable. Avoid slowing down for objections unless they are obviously fatal.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stageData(result: WrapResult, stage: string): Record<string, unknown> {
  const data = result.stages.find((item) => item.stage === stage)?.data;
  return isRecord(data) ? data : {};
}

function asNumberArray(value: unknown, length: number, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const nums = value.slice(0, length).map((item) => (typeof item === 'number' ? item : 0));
  return nums.length === length ? nums : fallback;
}

function flattenDriveScores(value: unknown): number[] {
  if (!Array.isArray(value)) return [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
  if (value.every((item) => typeof item === 'number')) {
    return asNumberArray(value, 7, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  }
  const flattened = value.slice(0, 7).map((item) => {
    if (Array.isArray(item) && typeof item[0] === 'number') return item[0];
    return 0;
  });
  return flattened.length === 7 ? flattened : [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5];
}

function extractForecastRequest(text: string, result: WrapResult): ForecastRequest {
  const operatorData = stageData(result, 'operator_scoring');
  const domainData = stageData(result, 'domain_coherence');
  const rpmData = stageData(result, 'rpm_gate');
  const normalizedScores = asNumberArray(operatorData.scores, 10, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
  const rawFallback = normalizedScores.map((score) => Math.round(score * 10 * 100) / 100);
  const resolutionDetails = Array.isArray(rpmData.resolution_details)
    ? rpmData.resolution_details.filter(isRecord)
    : [];

  return {
    context_label: text.trim().slice(0, 120) || 'Wrap Pipeline forecast',
    source: 'wrap_pipeline',
    operator_scores: asNumberArray(operatorData.raw_scores_0_to_10, 10, rawFallback),
    domain_scores: asNumberArray(domainData.domain_averages, 4, [0.25, 0.25, 0.25, 0.25]),
    drive_scores: flattenDriveScores(rpmData.drive_scores),
    rpm_completeness: typeof rpmData.rpm_completeness === 'number' ? rpmData.rpm_completeness : 1,
    fractal_sequence: result.fractal_analysis?.dominant_sequence ?? [],
    resolution_details: resolutionDetails,
  };
}

function bandClasses(band: ForecastRiskBand): string {
  switch (band) {
    case 'low':
      return 'border-[#37f5a0]/40 bg-[#13201c] text-[#37f5a0]';
    case 'watch':
      return 'border-[#f59e0b]/40 bg-[#f59e0b]/10 text-[#f59e0b]';
    case 'elevated':
      return 'border-orange-400/40 bg-orange-400/10 text-orange-300';
    case 'high':
      return 'border-[#ff7b72]/45 bg-[#ff7b72]/10 text-[#ff7b72]';
  }
}

function bandMeaning(band: ForecastRiskBand): string {
  switch (band) {
    case 'low':
      return 'No major gap pattern is dominating this profile.';
    case 'watch':
      return 'There are some gaps worth checking before relying on the output.';
    case 'elevated':
      return 'Several structural gaps line up; run targeted tests before trusting this pattern.';
    case 'high':
      return 'The profile is heavily uneven; treat the top risks as active test priorities.';
  }
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function PlainLanguageGuide() {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {[
        ['01', 'Paste or pick an example', 'Use normal language. CAS extracts the structure behind it.'],
        ['02', 'Read the top risk first', 'The highest card tells you the most likely failure mode to test.'],
        ['03', 'Use checks, not guesses', 'Each result gives practical checks that can confirm or falsify the risk.'],
      ].map(([step, title, body]) => (
        <div key={step} className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-4">
          <div className="mb-3 inline-flex items-center justify-center rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] px-2 py-0.5 font-['Geist_Mono'] text-[11px] font-semibold text-[#37f5a0]">
            {step}
          </div>
          <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee]">{title}</p>
          <p className="mt-1 text-xs leading-relaxed text-[#86958d]">{body}</p>
        </div>
      ))}
    </div>
  );
}

function MetricBars({ title, names, values, max }: { title: string; names: string[]; values: number[]; max: number }) {
  return (
    <div>
      <p className="mb-2 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">{title}</p>
      <div className="space-y-2">
        {names.map((name, index) => {
          const value = values[index] ?? 0;
          const width = Math.max(2, Math.min(100, (value / max) * 100));
          return (
            <div key={name} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-xs">
              <span className="truncate text-[#b3c2ba]">{name}</span>
              <div className="h-2 overflow-hidden rounded-[2px] bg-[#13201c] border border-[#20302b]">
                <div className="h-full bg-[#37f5a0]" style={{ width: `${width}%` }} />
              </div>
              <span className="text-right font-['Geist_Mono'] text-[11px] text-[#86958d]">{max === 10 ? value.toFixed(1) : formatPercent(value)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ForecastSummary({ result }: { result: ForecastResponse }) {
  return (
    <Card className="overflow-hidden">
      <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] p-5">
          <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0]">Overall risk level</p>
          <div className="mt-4 flex items-end gap-3">
            <span className="font-['Space_Grotesk'] text-5xl font-bold tracking-[-0.03em] text-[#eaf3ee]">{result.overall_risk_score.toFixed(1)}</span>
            <span className="pb-2 font-['Geist_Mono'] text-sm text-[#86958d]">/ 100</span>
          </div>
          <div className={`mt-4 inline-flex rounded-[2px] border px-2.5 py-1 font-['Geist_Mono'] text-[11px] font-semibold uppercase tracking-[0.08em] ${bandClasses(result.risk_band)}`}>
            {result.risk_band}
          </div>
          <p className="mt-4 text-sm leading-relaxed text-[#b3c2ba]">
            {bandMeaning(result.risk_band)} This is a test-planning signal, not a deterministic prediction or clinical conclusion.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
            <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Gap pattern</p>
            <p className="mt-2 font-['Space_Grotesk'] text-2xl font-bold text-[#eaf3ee]">{result.lacunarity.classification}</p>
            <p className="mt-1 font-['Geist_Mono'] text-xs text-[#86958d]">Technical lacunarity score {result.lacunarity.composite.toFixed(2)}</p>
          </div>
          <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
            <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Research status</p>
            <p className="mt-2 font-['Geist_Mono'] text-xs uppercase tracking-[0.08em] font-semibold text-[#f59e0b]">
              ◕ {result.validation_status.replace(/_/g, ' ')}
            </p>
          </div>
          <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4 sm:col-span-2">
            <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Main gaps to inspect</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(result.dominant_structural_gaps.weak_noetics ?? []).map((item) => (
                <span key={`n-${item}`} className="rounded-[2px] border border-[#37f5a0]/35 bg-[#0c1513] px-2.5 py-1 font-['Geist_Mono'] text-[11px] text-[#37f5a0]">{item}</span>
              ))}
              {(result.dominant_structural_gaps.weak_domains ?? []).map((item) => (
                <span key={`d-${item}`} className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2.5 py-1 font-['Geist_Mono'] text-[11px] text-[#eaf3ee]">Domain {item}</span>
              ))}
              {(result.dominant_structural_gaps.weak_drives ?? []).map((item) => (
                <span key={`f-${item}`} className="rounded-[2px] border border-[#f59e0b]/35 bg-[#0c1513] px-2.5 py-1 font-['Geist_Mono'] text-[11px] text-[#f59e0b]">{item}</span>
              ))}
              {result.dominant_structural_gaps.largest_involution_gap && (
                <span className="rounded-[2px] border border-[#ff7b72]/40 bg-[#0c1513] px-2.5 py-1 font-['Geist_Mono'] text-[11px] text-[#ff7b72]">
                  Involution gap: {result.dominant_structural_gaps.largest_involution_gap.pair}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ForecastCards({ result }: { result: ForecastResponse }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {result.forecasts.map((forecast, index) => (
        <Card key={forecast.id} className="relative overflow-hidden">
          <div className="absolute right-4 top-3 font-['Geist_Mono'] text-4xl font-bold text-[#20302b]">{String(index + 1).padStart(2, '0')}</div>
          <div className="relative space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-['Space_Grotesk'] text-base font-semibold text-[#eaf3ee]">{forecast.label}</p>
                <p className="mt-1 text-sm leading-relaxed text-[#b3c2ba]">{forecast.summary}</p>
              </div>
              <div className={`shrink-0 rounded-[2px] border px-2.5 py-1 font-['Geist_Mono'] text-xs font-semibold uppercase tracking-[0.08em] ${bandClasses(forecast.risk_band)}`}>
                {forecast.risk_score}
              </div>
            </div>
            <div>
              <p className="mb-2 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Why this was flagged</p>
              <div className="space-y-1.5">
                {forecast.drivers.map((driver) => (
                  <p key={driver} className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-xs text-[#b3c2ba]">{driver}</p>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">What to test next</p>
              <div className="space-y-1.5">
                {forecast.recommended_checks.map((check) => (
                  <p key={check} className="rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] px-3 py-2 text-xs text-[#eaf3ee]">{check}</p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export function ForecastPage() {
  const [text, setText] = useState(EXAMPLE_TEXT);
  const [result, setResult] = useState<ForecastResponse | null>(null);
  const [wrapSnapshot, setWrapSnapshot] = useState<WrapResult | null>(null);
  const [activeRequest, setActiveRequest] = useState<ForecastRequest>(BALANCED_REQUEST);
  const [showTechnicalInput, setShowTechnicalInput] = useState(false);

  const presetMutation = useMutation({
    mutationFn: (req: ForecastRequest) => postForecast(req),
    onSuccess(data) {
      setWrapSnapshot(null);
      setResult(data);
    },
  });

  const textMutation = useMutation({
    mutationFn: async (prompt: string) => {
      const wrap = await postWrap({
        text: prompt,
        provider: 'mock',
        mock: true,
        scoring_mode: 'heuristic_fallback',
      });
      const request = extractForecastRequest(prompt, wrap);
      const forecast = await postForecast(request);
      return { forecast, request, wrap };
    },
    onSuccess(data) {
      setActiveRequest(data.request);
      setWrapSnapshot(data.wrap);
      setResult(data.forecast);
    },
  });

  const isRunning = presetMutation.isPending || textMutation.isPending;
  const activeError = (presetMutation.error ?? textMutation.error) as Error | null;

  function runPreset(req: ForecastRequest) {
    setActiveRequest(req);
    presetMutation.mutate(req);
  }

  function runTextForecast() {
    if (!text.trim()) return;
    textMutation.mutate(text);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0]">
            ◕ Under evaluation · Research preview
          </span>
          <span className="rounded-[2px] border border-[#f59e0b]/35 bg-[#13201c] px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#f59e0b]">
            Not deterministic
          </span>
        </div>
        <h1 className="max-w-3xl font-['Space_Grotesk'] text-3xl font-bold tracking-[-0.03em] text-[#eaf3ee] sm:text-4xl">
          Risk Forecast
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-[#b3c2ba]">
          Find where a prompt, response pattern, or profile may break under pressure. CAS converts the underlying structure into ranked checks you can actually test.
        </p>
        <p className="mt-2 font-['Geist_Mono'] text-xs text-[#86958d]">
          Technical name: Predictive Lacunarity Risk.
        </p>
      </div>

      <PlainLanguageGuide />

      <div className="grid gap-5 lg:grid-cols-[1fr_0.85fr]">
        <Card title="Check Text">
          <div className="space-y-4">
            <textarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={5}
              className="w-full resize-none rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3 text-sm leading-6 text-[#eaf3ee] placeholder-[#62706a] outline-none transition-colors focus:border-[#37f5a0]"
              placeholder="Enter a prompt or response pattern to assess..."
            />
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-relaxed text-[#86958d]">
                Use normal language. The app handles the CAS metrics in the background.
              </p>
              <button
                onClick={runTextForecast}
                disabled={isRunning || !text.trim()}
                className="rounded-[2px] bg-[#37f5a0] px-5 py-2.5 text-sm font-semibold text-[#050b0a] transition-colors hover:bg-[#37f5a0]/90 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {textMutation.isPending ? 'Running check...' : 'Run Risk Check'}
              </button>
            </div>
          </div>
        </Card>

        <Card title="Try Examples">
          <div className="space-y-3">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => runPreset(preset.request)}
                disabled={isRunning}
                className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] p-4 text-left transition-colors hover:border-[#37f5a0] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <p className="font-['Space_Grotesk'] text-sm font-semibold text-[#eaf3ee]">{preset.label}</p>
                <p className="mt-1 text-xs leading-relaxed text-[#86958d]">{preset.description}</p>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card
        title="Technical Input"
        action={
          <button
            onClick={() => setShowTechnicalInput((value) => !value)}
            className="rounded-[2px] border border-[#eaf3ee] bg-transparent px-3 py-1.5 text-xs font-medium text-[#eaf3ee] transition-colors hover:bg-[#13201c]"
          >
            {showTechnicalInput ? 'Hide metrics' : 'Show metrics'}
          </button>
        }
      >
        {showTechnicalInput ? (
          <div className="grid gap-6 lg:grid-cols-3">
            <MetricBars title="Thinking patterns" names={NOETIC_NAMES} values={activeRequest.operator_scores} max={10} />
            <MetricBars title="Processing balance" names={DOMAIN_NAMES} values={activeRequest.domain_scores} max={1} />
            <MetricBars title="Motivational supports" names={DRIVE_NAMES} values={activeRequest.drive_scores} max={1} />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-[#86958d]">
            Hidden by default to keep the page readable. Open this when you need to audit the exact Noetic, domain, and drive inputs used for the forecast.
          </p>
        )}
      </Card>

      {isRunning && (
        <div role="status" className="flex items-center gap-3 rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] px-4 py-3 text-sm text-[#eaf3ee]">
          <LoadingSpinner />
          Computing risk forecast...
        </div>
      )}

      <ErrorBanner error={activeError} />

      {result && (
        <div className="space-y-5">
          <ForecastSummary result={result} />

          {wrapSnapshot && (
            <Card title="Wrap Pipeline Source">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">NCCS</p>
                  <p className="mt-2 font-['Space_Grotesk'] text-2xl font-bold text-[#eaf3ee]">{wrapSnapshot.nccs.composite.toFixed(1)}</p>
                </div>
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Certification</p>
                  <p className="mt-2 font-['Space_Grotesk'] text-lg font-semibold text-[#37f5a0]">{wrapSnapshot.nccs.certification}</p>
                </div>
                <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Scoring</p>
                  <p className="mt-2 font-['Geist_Mono'] text-xs font-semibold text-[#eaf3ee]">{wrapSnapshot.scoring_method ?? 'heuristic_fallback'}</p>
                </div>
              </div>
            </Card>
          )}

          <ForecastCards result={result} />

          <Card title="What this can and cannot say">
            <div className="space-y-2">
              {result.limitations.map((limitation) => (
                <p key={limitation} className="rounded-[2px] border border-[#f59e0b]/35 bg-[#f59e0b]/10 px-3 py-2 text-sm leading-relaxed text-[#eaf3ee]">
                  {limitation}
                </p>
              ))}
              <p className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-xs leading-relaxed text-[#86958d]">
                Development stance: this can improve CAS by making gaps testable and actionable. It should not be marketed as mind reading, medical diagnosis, or guaranteed physical-behavior prediction.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
