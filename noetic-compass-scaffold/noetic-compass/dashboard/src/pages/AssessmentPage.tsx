import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useLocation } from 'react-router-dom';
import { useWrap } from '../hooks/useWrap';
import { useBenchmark } from '../hooks/useBenchmark';
import { BenchmarkResults } from '../components/shared/BenchmarkResults';
import { useTranslation } from '../hooks/useTranslation';
import { Card } from '../components/shared/Card';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { CertBadge } from '../components/shared/CertBadge';
import { ExportButton } from '../components/shared/ExportButton';
import { ExplainPanel } from '../components/shared/ExplainPanel';
import { Disclosure } from '../components/shared/Disclosure';
import { ExecutiveSummary } from '../components/shared/ExecutiveSummary';
import { AiBriefing } from '../components/shared/AiBriefing';
import { AiResponsePanel } from '../components/shared/AiResponsePanel';
import { FractalCard } from '../components/charts/FractalCard';
import { LacunarityCard } from '../components/charts/LacunarityCard';
import { TraceViewer } from '../components/shared/TraceViewer';
import { NotationComposer } from '../components/shared/NotationComposer';
import { NotationDiff } from '../components/shared/NotationDiff';
import { SignalHeatmap } from '../components/shared/SignalHeatmap';
import { InversionAlert } from '../components/shared/InversionAlert';
import { BlindSpotCard } from '../components/shared/BlindSpotCard';
import { ConfidenceIndicator } from '../components/shared/ConfidenceIndicator';
import { InterpretButton } from '../components/shared/InterpretButton';
import { ResearchPrototypeNotice } from '../components/shared/ResearchPrototypeNotice';
import { PIPELINE_STAGES } from '../lib/constants';
import { computeBlindSpots } from '../lib/blindSpots';
import { interpretStage } from '../lib/interpretations';
import { interpretNccs, interpretSubScores, interpretOperators, interpretHeatmap, interpretDomainBalance, interpretExecutiveSummary, interpretStabilityAlerts, interpretBlindSpots, interpretDrives, interpretRpm, interpretInversions, interpretPipeline, interpretFractal, interpretTrace } from '../lib/cardInterpretations';
import { formatProviderLabel } from '../lib/providerLabels';
import { postAnalyzeText } from '../api/endpoints';
import type { LiveNotationResult } from '../api/endpoints';
import type { ScoringMode, WrapResult } from '../api/types';
import { analyzeTextToNotation } from '../lib/textSignalAnalyzer';

const LazyNccsGauge = lazy(() => import('../components/charts/NccsGauge').then((m) => ({ default: m.NccsGauge })));
const LazySubScoreBreakdown = lazy(() => import('../components/charts/SubScoreBreakdown').then((m) => ({ default: m.SubScoreBreakdown })));
const LazyOperatorRadarChart = lazy(() => import('../components/charts/OperatorRadarChart').then((m) => ({ default: m.OperatorRadarChart })));
const LazyDomainCoherenceRadar = lazy(() => import('../components/charts/DomainCoherenceRadar').then((m) => ({ default: m.DomainCoherenceRadar })));
const LazyStateHeatmap = lazy(() => import('../components/charts/StateHeatmap').then((m) => ({ default: m.StateHeatmap })));
const LazyCoreDriveTree = lazy(() => import('../components/charts/CoreDriveTree').then((m) => ({ default: m.CoreDriveTree })));
const LazyRpmGraph = lazy(() => import('../components/charts/RpmGraph').then((m) => ({ default: m.RpmGraph })));
const LazyInversionMap = lazy(() => import('../components/charts/InversionMap').then((m) => ({ default: m.InversionMap })));

const PROVIDERS = ['mock', 'openai', 'anthropic', 'google', 'meta', 'xai', 'deepseek', 'qwen'];
const SCORER_PROVIDERS = PROVIDERS.filter((provider) => provider !== 'mock');

function getScoringMethodLabel(method: ScoringMode | undefined): string {
  switch (method) {
    case 'secondary_llm':
      return 'Secondary LLM assessor';
    case 'self_reported':
      return 'Self-reported inline scores';
    case 'heuristic_fallback':
    default:
      return 'Deterministic heuristic fallback';
  }
}

function getScoringMethodDescription(method: ScoringMode | undefined): string {
  switch (method) {
    case 'secondary_llm':
      return 'Independent scorer.';
    case 'self_reported':
      return 'Generator self-score.';
    case 'heuristic_fallback':
    default:
      return 'Deterministic baseline.';
  }
}

function formatMeasurementLabel(metric: string): string {
  const labels: Record<string, string> = {
    social_engineering: 'Social engineering resistance',
    bias_flags: 'Bias flags',
  };
  return labels[metric] ?? metric.replace(/_/g, ' ');
}

function StageTimeline({ stages }: { stages: WrapResult['stages'] }) {
  const [selected, setSelected] = useState<number | null>(null);

  const insight = selected !== null ? interpretStage(stages[selected], selected) : null;

  return (
    <div className="space-y-2">
      {stages.map((s, i) => (
        <div
          key={i}
          className="flex items-center gap-3 animate-chart-in cursor-pointer rounded-[2px] px-1.5 py-1 hover:bg-[#13201c] transition-colors"
          style={{ animationDelay: `${i * 60}ms` }}
          onClick={() => setSelected(selected === i ? null : i)}
        >
          <div className="relative flex items-center justify-center w-5 h-5">
            {s.success ? (
              <>
                <div className="absolute inset-0 rounded-full bg-[#37f5a0]/20" />
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 6L5 8.5L9.5 3.5" stroke="#37f5a0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </>
            ) : (
              <>
                <div className="absolute inset-0 rounded-full bg-[#ff7b72]/20" />
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M2.5 2.5L7.5 7.5M7.5 2.5L2.5 7.5" stroke="#ff7b72" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </>
            )}
          </div>
          <span className={`text-xs font-medium w-32 ${selected === i ? 'text-[#eaf3ee]' : 'text-[#b3c2ba]'}`}>
            {PIPELINE_STAGES[i]}
          </span>
          <div className="flex-1 h-1 rounded-[2px] bg-[#13201c] overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${s.success ? 'bg-[#37f5a0]/55' : 'bg-[#ff7b72]/55'}`}
              style={{ width: '100%', animationDelay: `${i * 80}ms` }}
            />
          </div>
          {s.error && <span className="text-[11px] text-[#ff7b72]">{s.error}</span>}
        </div>
      ))}

      {insight && (
        <ExplainPanel visible={true} onClose={() => setSelected(null)}>
          <p className="font-medium text-[#eaf3ee]">{insight.name}</p>
          <p>{insight.description}</p>
          <p className={insight.success ? 'text-[#37f5a0]' : 'text-[#ff7b72]'}>{insight.status}</p>
        </ExplainPanel>
      )}
    </div>
  );
}

export function AssessmentPage() {
  const [text, setText] = useState('');
  const [notation, setNotation] = useState('');
  const [provider, setProvider] = useState('mock');
  const [scoringMode, setScoringMode] = useState<ScoringMode>('heuristic_fallback');
  const [scoringProvider, setScoringProvider] = useState('auto');
  const [showAdvancedScoring, setShowAdvancedScoring] = useState(false);
  const [viewMode, setViewMode] = useState<'summary' | 'technical'>('summary');
  const [inputMode, setInputMode] = useState<'text' | 'compose'>('text');
  const [assessMode, setAssessMode] = useState<'single' | 'benchmark'>('single');
  const [benchProviders, setBenchProviders] = useState<string[]>(['mock']);
  const [runsPerProvider, setRunsPerProvider] = useState(5);
  const [liveNotation, setLiveNotation] = useState<LiveNotationResult | null>(null);
  const [liveNotationLoading, setLiveNotationLoading] = useState(false);
  const liveNotationAbort = useRef<AbortController | null>(null);
  const [expectedNotation, setExpectedNotation] = useState<string | null>(null);
  const [expectedEnglish, setExpectedEnglish] = useState<string | null>(null);
  const scenarioNotationRef = useRef<string | null>(null);
  const wrap = useWrap();
  const benchmark = useBenchmark();
  const location = useLocation();
  const benchResultsRef = useRef<HTMLDivElement>(null);
  const previousProviderRef = useRef(provider);

  // Accept prefilled prompt from navigation (e.g., from Scenario Browser)
  useEffect(() => {
    const state = location.state as { prefill?: string; notationPrefill?: string; notationEnglish?: string } | null;
    if (state?.prefill || state?.notationPrefill) {
      if (typeof state?.notationPrefill === 'string') {
        scenarioNotationRef.current = state.notationPrefill;
        setNotation(state.notationPrefill);
        setExpectedNotation(state.notationPrefill);
      }
      if (state?.prefill) {
        setText(state.prefill);
      }
      if (typeof state?.notationEnglish === 'string') {
        setExpectedEnglish(state.notationEnglish);
      }
      setInputMode(state?.notationPrefill?.trim() ? 'compose' : 'text');
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  useEffect(() => {
    if (previousProviderRef.current === provider) {
      return;
    }

    previousProviderRef.current = provider;
    if (provider === 'mock') {
      if (!showAdvancedScoring || scoringMode === 'secondary_llm') {
        setScoringMode('heuristic_fallback');
      }
      return;
    }

    if (!showAdvancedScoring || scoringMode === 'heuristic_fallback') {
      setScoringMode('secondary_llm');
    }
  }, [provider, scoringMode, showAdvancedScoring]);

  useEffect(() => {
    if (!showAdvancedScoring && scoringMode === 'self_reported') {
      setScoringMode(provider === 'mock' ? 'heuristic_fallback' : 'secondary_llm');
    }
  }, [provider, scoringMode, showAdvancedScoring]);

  // Live notation: client-side analysis runs instantly as user types.
  // The API call is an optional enhancement for the signal heatmap.
  useEffect(() => {
    const trimmed = text.trim();

    // If a scenario set the notation, don't overwrite until the user actually edits
    if (scenarioNotationRef.current) {
      // Clear the guard once the user modifies the text
      // (text will differ from original once they type)
      return;
    }

    if (!trimmed || trimmed.length < 10) {
      setLiveNotation(null);
      return;
    }

    // Instant client-side analysis — no API dependency
    const clientNotation = analyzeTextToNotation(trimmed);
    setNotation(clientNotation);
    if (clientNotation) {
      setLiveNotation((prev) => ({
        source: clientNotation,
        valid: true,
        english: prev?.english ?? '',
        provenance: prev?.provenance,
        signals: prev?.signals,
      }));
    }

    // Debounced API call for full signal breakdown + English rendering
    const timer = setTimeout(() => {
      liveNotationAbort.current?.abort();
      const controller = new AbortController();
      liveNotationAbort.current = controller;

      setLiveNotationLoading(true);
      postAnalyzeText(trimmed)
        .then((result) => {
          if (!controller.signal.aborted) {
            setLiveNotation(result);
            if (result.source) {
              setNotation(result.source);
            }
          }
        })
        .catch(() => {
          // API unavailable — client-side notation already set above
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLiveNotationLoading(false);
          }
        });
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  function handleSubmit() {
    if (!text.trim()) return;
    if (assessMode === 'single') {
      wrap.mutate({
        text,
        provider,
        mock: provider === 'mock',
        scoring_mode: scoringMode,
        scoring_provider: scoringMode === 'secondary_llm' && scoringProvider !== 'auto' ? scoringProvider : null,
      });
    } else {
      if (benchProviders.length === 0) return;
      benchmark.mutate({ text, providers: benchProviders, runs_per_provider: runsPerProvider });
    }
  }

  function toggleBenchProvider(p: string) {
    setBenchProviders((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  // Auto-scroll to benchmark results when they arrive
  useEffect(() => {
    if (benchmark.data && benchResultsRef.current) {
      benchResultsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [benchmark.data]);

  const result = wrap.data;
  const translated = useTranslation(result);
  const scoringMethod = result?.scoring_method ?? result?.provenance?.scoring_method;
  const resolvedScorerProvider = typeof result?.provenance?.scorer_provider === 'string'
    ? result.provenance.scorer_provider
    : null;
  const resolvedScorerModel = typeof result?.provenance?.scorer_model === 'string'
    ? result.provenance.scorer_model
    : null;
  const notMeasured = result?.nccs.not_measured ?? [];
  const unmeasuredLabels = notMeasured.map(formatMeasurementLabel);

  const operatorScores = result?.stages.find(s => s.stage === 'operator_scoring')?.data?.scores as number[] | undefined;
  // CAS v7.5 Register data flow (Clarification 8). Prefer the top-level
  // `score_registers` field (canonical serialization) and fall back to the
  // operator_scoring stage `data.score_registers` if the top-level field
  // is absent (defensive; keeps legacy stage-data consumers working).
  const scoreRegisters =
    result?.score_registers ??
    (result?.stages.find(s => s.stage === 'operator_scoring')?.data?.score_registers as
      | (import('../api/types').PhenomenologicalRegister | null)[]
      | undefined) ??
    null;
  const domainAverages = result?.stages.find(s => s.stage === 'domain_coherence')?.data?.domain_averages as number[] | undefined;
  const driveScores = result?.stages.find(s => s.stage === 'rpm_gate')?.data?.drive_scores as number[][] | undefined;
  const a0Score = result?.stages.find(s => s.stage === 'rpm_gate')?.data?.a0_score as number | undefined;
  const rpmCompleteness = result?.stages.find(s => s.stage === 'rpm_gate')?.data?.rpm_completeness as number | undefined;
  const axisScores = result?.stages.find(s => s.stage === 'inversion_scan')?.data?.axis_scores as number[] | undefined;
  const stealthResistance = result?.stages.find(s => s.stage === 'inversion_scan')?.data?.stealth_resistance as number | undefined;

  const flatDrives = driveScores?.map(d => d[0]);
  const blindSpots = operatorScores && domainAverages
    ? computeBlindSpots(operatorScores, domainAverages, flatDrives)
    : [];
  const chartFallback = (
    <div className="flex min-h-[280px] items-center justify-center rounded-[2px] border border-[#20302b] bg-[#13201c] font-['Geist_Mono'] text-xs text-[#86958d]">
      Loading visualization...
    </div>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#37f5a0] mb-1">
            ◐ Prototype · CAS Compass Evaluation
          </p>
          <h2 className="font-['Space_Grotesk'] text-2xl font-bold tracking-[-0.03em] text-[#eaf3ee]">Assessment</h2>
        </div>
        {/* Single / Benchmark mode toggle */}
        <div className="inline-flex rounded-[2px] border border-[#20302b] bg-[#0c1513] p-1">
          <button
            onClick={() => setAssessMode('single')}
            className={`rounded-[2px] px-4 py-1.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] font-medium transition-colors min-h-[36px] ${
              assessMode === 'single' ? 'bg-[#37f5a0] text-[#050b0a]' : 'text-[#86958d] hover:text-[#eaf3ee]'
            }`}
          >
            Single Assessment
          </button>
          <button
            onClick={() => setAssessMode('benchmark')}
            className={`rounded-[2px] px-4 py-1.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] font-medium transition-colors min-h-[36px] ${
              assessMode === 'benchmark' ? 'bg-[#37f5a0] text-[#050b0a]' : 'text-[#86958d] hover:text-[#eaf3ee]'
            }`}
          >
            Benchmark Mode
          </button>
        </div>
      </div>

      <ConfidenceIndicator />
      <ResearchPrototypeNotice compact />

      <Card>
        {/* Tab switcher */}
        <div className="flex gap-1.5 mb-4 border-b border-[#20302b] pb-3">
          <button
            onClick={() => setInputMode('text')}
            className={`rounded-[2px] border px-3 py-1.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] font-medium transition-colors min-h-[36px] ${
              inputMode === 'text' ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]' : 'border-[#20302b] bg-transparent text-[#86958d] hover:text-[#eaf3ee]'
            }`}
          >
            Free Text
          </button>
          <button
            onClick={() => setInputMode('compose')}
            className={`rounded-[2px] border px-3 py-1.5 font-['Geist_Mono'] text-[11px] uppercase tracking-[0.06em] font-medium transition-colors min-h-[36px] ${
              inputMode === 'compose' ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]' : 'border-[#20302b] bg-transparent text-[#86958d] hover:text-[#eaf3ee]'
            }`}
          >
            Compose
          </button>
        </div>

        {/* Benchmark mode config — providers + runs, above the prompt field */}
        {assessMode === 'benchmark' && inputMode === 'text' && (
          <div className="space-y-3 mb-4 rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] p-4">
            <p className="text-xs text-[#b3c2ba]">
              Run the prompt below through each selected provider multiple times and compare mean scores + variance.
            </p>
            <div>
              <label className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d] mb-2">Providers</label>
              <div className="flex flex-wrap gap-2">
                    {PROVIDERS.map((p) => (
                      <button
                        key={p}
                    onClick={() => toggleBenchProvider(p)}
                    className={`px-3 py-2 rounded-[2px] text-xs font-medium transition-colors min-h-[36px] ${
                      benchProviders.includes(p)
                        ? 'bg-[#37f5a0] text-[#050b0a] border border-[#37f5a0]'
                        : 'bg-[#0c1513] text-[#b3c2ba] border border-[#20302b] hover:border-[#62706a]'
                    }`}
                    >
                    {formatProviderLabel(p)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d] mb-1">Runs per Provider</label>
              <input
                type="number"
                min={2}
                max={20}
                value={runsPerProvider}
                onChange={(e) => setRunsPerProvider(Math.min(20, Math.max(2, Number(e.target.value))))}
                className="w-20 rounded-[2px] border border-[#20302b] bg-[#0c1513] px-3 py-2 font-['Geist_Mono'] text-sm text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none min-h-[44px]"
              />
            </div>
          </div>
        )}

        {inputMode === 'text' ? (
          <div className="space-y-3">
            <textarea
              value={text}
              onChange={(e) => {
                scenarioNotationRef.current = null;
                setText(e.target.value);
              }}
              placeholder={assessMode === 'single' ? 'Enter text to assess...' : 'Enter prompt to benchmark across providers...'}
              rows={4}
              className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3 text-base sm:text-sm text-[#eaf3ee] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none resize-none"
            />

            {/* Live CAS notation — updates as user types */}
            {(liveNotation || liveNotationLoading) && (
              <div className={`rounded-[2px] border p-3 transition-colors ${liveNotation?.valid ? 'border-[#37f5a0]/35 bg-[#13201c]' : 'border-[#20302b] bg-[#13201c]'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Live CAS Analysis</p>
                  {liveNotationLoading && (
                    <span className="font-['Geist_Mono'] text-[10px] text-[#86958d]">analyzing...</span>
                  )}
                  {liveNotation?.valid && !liveNotationLoading && (
                    <span className="rounded-[2px] border border-[#37f5a0]/35 bg-[#0c1513] px-1.5 py-0.5 font-['Geist_Mono'] text-[10px] uppercase text-[#37f5a0]">compiler-validated</span>
                  )}
                </div>
                {liveNotation?.source ? (
                  <>
                    <p className="font-['Geist_Mono'] text-sm text-[#37f5a0] tracking-wide">{liveNotation.source}</p>
                    {liveNotation.english && (
                      <p className="text-xs text-[#b3c2ba] mt-1.5 leading-relaxed">{liveNotation.english}</p>
                    )}
                    {liveNotation.signals && (
                      <div className="mt-3 pt-3 border-t border-[#20302b]">
                        <SignalHeatmap
                          operatorScores={liveNotation.signals.operator_scores}
                          domainScores={liveNotation.signals.domain_scores}
                          driveScores={liveNotation.signals.drive_scores}
                          rpmSignal={liveNotation.signals.rpm_signal}
                        />
                      </div>
                    )}
                  </>
                ) : liveNotation && !liveNotationLoading ? (
                  <p className="text-xs text-[#86958d]">Need more text.</p>
                ) : null}
              </div>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {assessMode === 'single' && (
                <>
                  <div className="flex-1 space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label className="space-y-1">
                        <span className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Generator</span>
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
                        <span className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Scoring Mode</span>
                        <select
                          value={scoringMode}
                          onChange={(e) => setScoringMode(e.target.value as ScoringMode)}
                          className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-sm text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none min-h-[44px]"
                        >
                          {provider !== 'mock' && (
                            <option value="secondary_llm" className="bg-[#0c1513]">
                              Secondary LLM assessor (recommended)
                            </option>
                          )}
                          <option value="heuristic_fallback" className="bg-[#0c1513]">Heuristic fallback</option>
                          {showAdvancedScoring && (
                            <option value="self_reported" className="bg-[#0c1513]">Self-reported inline scores</option>
                          )}
                        </select>
                      </label>

                      <label className="space-y-1">
                        <span className="block font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Scorer Provider</span>
                        <select
                          value={scoringProvider}
                          onChange={(e) => setScoringProvider(e.target.value)}
                          disabled={scoringMode !== 'secondary_llm'}
                          className="w-full rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-sm text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none min-h-[44px] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <option value="auto" className="bg-[#0c1513]">Auto</option>
                          {SCORER_PROVIDERS.map((p) => (
                            <option key={p} value={p} className="bg-[#0c1513]">{formatProviderLabel(p)}</option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="flex items-start gap-3 rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={showAdvancedScoring}
                        onChange={(e) => setShowAdvancedScoring(e.target.checked)}
                        className="mt-1 h-4 w-4 rounded-[2px] border-[#20302b] bg-[#0c1513] accent-[#37f5a0]"
                      />
                      <span className="space-y-0.5">
                        <span className="block text-xs font-medium text-[#eaf3ee]">Show advanced scoring modes</span>
                        <span className="block text-xs text-[#86958d]">
                          Internal checks only.
                        </span>
                      </span>
                    </label>
                  </div>
                  {provider !== 'mock' && (
                    <span className="font-['Geist_Mono'] text-[11px] text-[#f59e0b] flex items-center gap-1.5">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Live API — requires key in .env
                    </span>
                  )}
                </>
              )}
              {assessMode === 'benchmark' && (
                <span className="font-['Geist_Mono'] text-xs text-[#86958d]">
                  {benchProviders.length * runsPerProvider} assessments will run ({benchProviders.length} providers × {runsPerProvider} runs)
                </span>
              )}
              <button
                onClick={handleSubmit}
                disabled={
                  (assessMode === 'single' ? wrap.isPending : benchmark.isPending) ||
                  !text.trim() ||
                  (assessMode === 'benchmark' && benchProviders.length === 0)
                }
                className="rounded-[2px] bg-[#37f5a0] px-6 py-3 sm:py-2 text-sm font-semibold text-[#050b0a] hover:bg-[#37f5a0]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                {assessMode === 'single'
                  ? wrap.isPending ? 'Assessing...' : 'Assess'
                  : benchmark.isPending ? 'Running...' : 'Run Benchmark'}
              </button>
            </div>
            {assessMode === 'single' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-2">
                  <p className="font-['Geist_Mono'] text-xs text-[#eaf3ee]">{getScoringMethodLabel(scoringMode)}</p>
                </div>
                {scoringMode === 'self_reported' && (
                  <p className="rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-3 py-2 text-xs text-[#f59e0b]">
                    Self-reported mode lets the generator grade its own response. Treat it as self-assessment only.
                  </p>
                )}
                <Disclosure summary="Scoring method details">
                  <p>{getScoringMethodDescription(scoringMode)}</p>
                  <p>
                    Least-biased automated baseline: <span className="font-['Geist_Mono'] text-[#eaf3ee]">heuristic_fallback</span>.
                    Best overall current mode: <span className="font-['Geist_Mono'] text-[#eaf3ee]">secondary_llm</span> with a separate scorer.
                    Worst stakeholder comparison mode: <span className="font-['Geist_Mono'] text-[#eaf3ee]">self_reported</span>.
                  </p>
                  {provider !== 'mock' && scoringMode === 'secondary_llm' && (
                    <p className="text-[#37f5a0]">
                      Recommended default for live providers: a separate scorer reduces self-grading risk and makes report provenance clearer.
                    </p>
                  )}
                  {scoringMode === 'secondary_llm' && (
                    <p>
                      Auto prefers a different scorer provider when one is configured and available. Pick a scorer provider explicitly if you want a specific grading source.
                    </p>
                  )}
                </Disclosure>
              </div>
            )}
          </div>
        ) : (
          <NotationComposer
            notation={notation}
            onNotationChange={setNotation}
            onGenerate={(prompt) => {
              setText(prompt);
              setInputMode('text');
            }}
          />
        )}
      </Card>

      {wrap.isPending && <LoadingSpinner />}
      <ErrorBanner error={wrap.error as Error | null} />

      {/* Benchmark mode: progress + results */}
      {assessMode === 'benchmark' && benchmark.isPending && (
        <div role="status" className="flex items-center gap-3 text-[#b3c2ba]">
          <LoadingSpinner />
          <span className="text-sm">
            Running {benchProviders.length * runsPerProvider} assessments...
          </span>
        </div>
      )}
      {assessMode === 'benchmark' && <ErrorBanner error={benchmark.error as Error | null} />}
      {assessMode === 'benchmark' && benchmark.data && (
        <div ref={benchResultsRef} className="scroll-mt-4">
          <BenchmarkResults data={benchmark.data} />
        </div>
      )}

      {assessMode === 'single' && result && (
        <div className="space-y-6">
          <ResearchPrototypeNotice />

          {/* Show the actual AI response that was assessed. Collapsed by default. */}
          <AiResponsePanel llmResponse={result.llm_response} />

          <Card title="Scoring Provenance">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3">
                <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Method</p>
                <p className="mt-1 text-sm font-medium text-[#eaf3ee]">{getScoringMethodLabel(scoringMethod)}</p>
              </div>
              <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3">
                <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Scorer Provider</p>
                <p className="mt-1 text-sm font-medium text-[#eaf3ee]">{resolvedScorerProvider ?? 'Not used'}</p>
              </div>
              <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-3">
                <p className="font-['Geist_Mono'] text-[11px] uppercase tracking-[0.08em] text-[#86958d]">Scorer Model</p>
                <p className="mt-1 text-sm font-medium text-[#eaf3ee]">{resolvedScorerModel ?? 'Not provided'}</p>
              </div>
            </div>
            <div className="mt-4 space-y-2 text-sm text-[#b3c2ba]">
              <p>{getScoringMethodDescription(scoringMethod)}</p>
              <Disclosure summary="What's measured vs. not validated">
                <p>
                  Social engineering resistance and bias-flag counts are measured as heuristic risk signals.
                  They are included in prototype scoring, but they are not validated instruments.
                </p>
              </Disclosure>
              <div className="flex flex-wrap gap-2">
                {scoringMethod === 'self_reported' && (
                  <span className="rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-2.5 py-1 font-['Geist_Mono'] text-[11px] uppercase text-[#f59e0b]">
                    Self-score
                  </span>
                )}
                {unmeasuredLabels.length > 0 && (
                  <span className="rounded-[2px] border border-[#f59e0b]/40 bg-[#f59e0b]/10 px-2.5 py-1 font-['Geist_Mono'] text-[11px] text-[#f59e0b]">
                    Unmeasured: {unmeasuredLabels.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </Card>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
            {result.interpretation && (
              <button
                onClick={() => setViewMode(viewMode === 'summary' ? 'technical' : 'summary')}
                className="rounded-[2px] border border-[#eaf3ee] bg-transparent px-3.5 py-2 text-xs font-medium text-[#eaf3ee] hover:bg-[#13201c] transition-colors min-h-[44px]"
              >
                {viewMode === 'summary' ? 'Show Technical View' : 'Show Summary View'}
              </button>
            )}
            <ExportButton result={result} text={text} timestamp={new Date().toLocaleString()} />
          </div>

          {viewMode === 'summary' && result.interpretation && (
            <AiBriefing
              interpretation={result.interpretation}
              modelName={result.llm_response?.model ?? null}
            />
          )}

          {result.compiled_notation?.source && expectedNotation ? (
            <Card title="Notation Analysis: Expected vs. Computed">
              <NotationDiff
                expected={expectedNotation}
                expectedEnglish={expectedEnglish}
                computed={result.compiled_notation.source}
                computedEnglish={result.compiled_notation.english}
                computedValid={result.compiled_notation.valid}
              />
            </Card>
          ) : result.compiled_notation?.source ? (
            <Card title="CAS Notation (Computed)">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {result.compiled_notation.valid ? (
                    <span className="rounded-[2px] border border-[#37f5a0]/35 bg-[#13201c] px-2 py-0.5 font-['Geist_Mono'] text-[10px] uppercase text-[#37f5a0] font-medium">compiler-validated</span>
                  ) : (
                    <span className="rounded-[2px] border border-[#f59e0b]/35 bg-[#13201c] px-2 py-0.5 font-['Geist_Mono'] text-[10px] uppercase text-[#f59e0b] font-medium">unvalidated</span>
                  )}
                  <span className="font-['Geist_Mono'] text-[11px] text-[#86958d]">pipeline-derived</span>
                </div>
                <p className="font-['Geist_Mono'] text-base text-[#37f5a0] tracking-wide">{result.compiled_notation.source}</p>
                {result.compiled_notation.english && (
                  <p className="text-sm text-[#b3c2ba]">{result.compiled_notation.english}</p>
                )}
              </div>
            </Card>
          ) : null}

          {(viewMode === 'technical' || !result.interpretation) && (
            <>
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <Card title="NCCS Score" action={<InterpretButton interpretation={interpretNccs(result.nccs)} />}>
                  <div className="flex flex-col items-center gap-4">
                    <Suspense fallback={chartFallback}>
                      <LazyNccsGauge composite={result.nccs.composite} certification={result.nccs.certification} nccs={result.nccs} />
                    </Suspense>
                    <CertBadge certification={result.nccs.certification} composite={result.nccs.composite} />
                  </div>
                </Card>
                <Card title="Sub-Score Breakdown" action={<InterpretButton interpretation={interpretSubScores(result.nccs)} />}>
                  <Suspense fallback={chartFallback}>
                    <LazySubScoreBreakdown nccs={result.nccs} />
                  </Suspense>
                </Card>
              </div>

              {/* Executive Summary (translated) */}
              {translated && (
                <Card title="Executive Summary" action={<InterpretButton interpretation={interpretExecutiveSummary()} />}>
                  <ExecutiveSummary data={translated} />
                </Card>
              )}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {operatorScores && (
                  <Card title="Thinking Patterns" action={<InterpretButton interpretation={interpretOperators(operatorScores)} />}>
                    <Suspense fallback={chartFallback}>
                      <LazyOperatorRadarChart scores={operatorScores} registers={scoreRegisters} />
                    </Suspense>
                  </Card>
                )}
                <Card title="Processing Balance" action={domainAverages ? <InterpretButton interpretation={interpretDomainBalance(domainAverages)} /> : undefined}>
                  <Suspense fallback={chartFallback}>
                    <LazyDomainCoherenceRadar result={result} />
                  </Suspense>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                {operatorScores && domainAverages && (
                  <Card title="40-State Heatmap" action={<InterpretButton interpretation={interpretHeatmap(operatorScores, domainAverages)} />}>
                    <Suspense fallback={chartFallback}>
                      <LazyStateHeatmap operatorScores={operatorScores} domainAverages={domainAverages} />
                    </Suspense>
                  </Card>
                )}
                {/* Inversion Alert (Task 2) */}
                {axisScores && stealthResistance !== undefined && (
                  <Card title="Stability Alerts" action={<InterpretButton interpretation={interpretStabilityAlerts(axisScores)} />}>
                    <InversionAlert result={result} />
                  </Card>
                )}
              </div>

              {blindSpots.length > 0 && (
                <Card title="Cognitive Blind Spots" action={<InterpretButton interpretation={interpretBlindSpots(blindSpots)} />}>
                  <BlindSpotCard spots={blindSpots} />
                </Card>
              )}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                {driveScores && driveScores.length > 0 && (
                  <Card title="Core Drives" action={<InterpretButton interpretation={interpretDrives(driveScores.map(d => d[0]))} />}>
                    <Suspense fallback={chartFallback}>
                      <LazyCoreDriveTree driveScores={driveScores.map(d => d[0])} />
                    </Suspense>
                  </Card>
                )}
                {driveScores && a0Score !== undefined && rpmCompleteness !== undefined && (
                  <Card title="RPM Graph" action={<InterpretButton interpretation={interpretRpm(driveScores, a0Score, rpmCompleteness)} />}>
                    <Suspense fallback={chartFallback}>
                      <LazyRpmGraph
                        a0Score={a0Score}
                        driveScores={driveScores}
                        rpmCompleteness={rpmCompleteness}
                        resolutionDetails={result?.stages.find(s => s.stage === 'rpm_gate')?.data?.resolution_details as { drive: number; resolutions: { node: string; mechanism: string; operators: string[]; strength: number; components?: number }[] }[] | undefined}
                      />
                    </Suspense>
                  </Card>
                )}
                {axisScores && stealthResistance !== undefined && (
                  <Card title="Inversion Map" action={<InterpretButton interpretation={interpretInversions(axisScores, stealthResistance)} />}>
                    <Suspense fallback={chartFallback}>
                      <LazyInversionMap axisScores={axisScores} stealthResistance={stealthResistance} />
                    </Suspense>
                  </Card>
                )}
              </div>

              <Card title="Pipeline Stages" action={<InterpretButton interpretation={interpretPipeline(result.stages)} />}>
                <StageTimeline stages={result.stages} />
              </Card>

              {result.fractal_analysis && (
                <Card title="Cognitive Fractal" action={<InterpretButton interpretation={interpretFractal(result.fractal_analysis)} />}>
                  <FractalCard analysis={result.fractal_analysis} />
                </Card>
              )}

              {result.lacunarity && (
                <Card title="Cognitive Lacunarity Profile">
                  <LacunarityCard profile={result.lacunarity} />
                </Card>
              )}

              <Card title="Evaluation Trace" action={<InterpretButton interpretation={interpretTrace(result.stages)} />}>
                <TraceViewer stages={result.stages} />
              </Card>
            </>
          )}
        </div>
      )}
    </div>
  );
}
