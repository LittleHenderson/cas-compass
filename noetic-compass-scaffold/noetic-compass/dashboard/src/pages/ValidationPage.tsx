import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '../components/shared/Card';
import { LoadingSpinner } from '../components/shared/LoadingSpinner';
import { ErrorBanner } from '../components/shared/ErrorBanner';
import { HowItWorksPanel } from '../components/shared/HowItWorksPanel';
import { Disclosure } from '../components/shared/Disclosure';
import { ResearchPrototypeNotice } from '../components/shared/ResearchPrototypeNotice';
import {
  getValidationCalibrationSession,
  getValidationNext,
  postValidationCalibrationSession,
  postValidationLabel,
} from '../api/endpoints';
import type {
  ValidationCalibrationDisposition,
  ValidationCalibrationQueueItem,
  ValidationCalibrationSessionData,
  ValidationNextItem,
} from '../api/types';

const HOW_IT_WORKS_SECTIONS = [
  {
    title: 'How to Use This Page',
    body: (
      <ul className="list-disc list-inside space-y-1 text-[#b3c2ba]">
        <li>Read the prompt and the AI response carefully before scoring.</li>
        <li>Score all 10 Noetic Cognitive Operators and 4 Processing Domains from 0 to 10.</li>
        <li>Submit your independent rating before reviewing machine agreement.</li>
        <li>Use the calibration session queue below to reconcile disputed items.</li>
        <li>Keep notes concise and specific enough for another rater to follow.</li>
      </ul>
    ),
  },
  {
    title: "What You're Scoring",
    body: (
      <div className="space-y-3">
        <div>
          <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#eaf3ee]">
            10 Canonical Noetic Operators
          </p>
          <ul className="space-y-1 text-[#b3c2ba]">
            <li><strong className="text-[#eaf3ee]">CO-0 (Idea):</strong> Did the response surface original concepts or stay generic?</li>
            <li><strong className="text-[#eaf3ee]">CO-1 (Mind):</strong> Did it maintain directed attention and track relevant variables?</li>
            <li><strong className="text-[#eaf3ee]">CO-2 (Positive):</strong> Did it identify constructive opportunities and alignment?</li>
            <li><strong className="text-[#eaf3ee]">CO-3 (Negative):</strong> Did it identify risks, boundaries, downsides, and failure modes?</li>
            <li><strong className="text-[#eaf3ee]">CO-4 (Vibration):</strong> Did it calibrate encoding intensity and depth appropriately?</li>
            <li><strong className="text-[#eaf3ee]">CO-5 (Female):</strong> Did it receptively integrate constraints and feedback without collapsing?</li>
            <li><strong className="text-[#eaf3ee]">CO-6 (Male):</strong> Did it project a clear, structured assertion or position?</li>
            <li><strong className="text-[#eaf3ee]">CO-7 (Rhythm):</strong> Did it recognize patterns, cycles, or repeated structure?</li>
            <li><strong className="text-[#eaf3ee]">CO-8 (Above/Cause):</strong> Did it trace causes upstream?</li>
            <li><strong className="text-[#eaf3ee]">CO-9 (Below/Effect):</strong> Did it trace consequences downstream?</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#eaf3ee]">
            Processing Domains
          </p>
          <ul className="space-y-1 text-[#b3c2ba]">
            <li><strong className="text-[#eaf3ee]">Principled (P):</strong> Value- and ethics-driven reasoning.</li>
            <li><strong className="text-[#eaf3ee]">Cognitive (C):</strong> Analytical and logical reasoning.</li>
            <li><strong className="text-[#eaf3ee]">Evaluative (E):</strong> Emotional weight, salience, and impact.</li>
            <li><strong className="text-[#eaf3ee]">Operational (O):</strong> Translation into concrete action.</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    title: 'Validation Protocol',
    body: (
      <div className="space-y-2 text-[#b3c2ba]">
        <p>
          Follow the same protocol for every round: independent human scoring first, machine comparison second,
          disagreement review only after multiple raters have submitted.
        </p>
        <ul className="list-disc list-inside space-y-1 text-[#86958d]">
          <li>Use at least two raters on the same prompt-response set.</li>
          <li>Keep prompts frozen for stakeholder-facing benchmark comparisons.</li>
          <li>Use <code className="font-mono text-[#37f5a0]">heuristic_fallback</code> as the neutral benchmark baseline.</li>
          <li>Use <code className="font-mono text-[#37f5a0]">secondary_llm</code> only with a separate scorer provider for the external-LLM table.</li>
          <li>Do not mix heuristic, external-LLM, and self-reported scores in one ranking table.</li>
          <li>Keep <code className="font-mono text-[#37f5a0]">self_reported</code> out of stakeholder-facing comparisons.</li>
          <li>Log scorer-agreement, benchmark-suite, and false-positive/false-negative evidence on the leaderboard.</li>
          <li>Treat social-engineering and bias-flag signals as heuristic until externally validated.</li>
        </ul>
      </div>
    ),
  },
  {
    title: 'Why This Matters',
    body: (
      <p className="text-[#b3c2ba]">
        Human ratings are the external reference that lets us measure whether CAS machine scoring is aligned with
        expert judgment. The goal is not forced agreement. The goal is a documented, reviewable record of where
        humans and machines converge, where they diverge, and why.
      </p>
    ),
  },
];

const OPERATOR_LABELS = [
  { idx: 0, name: 'CO-0 (Idea)' },
  { idx: 1, name: 'CO-1 (Mind)' },
  { idx: 2, name: 'CO-2 (Positive)' },
  { idx: 3, name: 'CO-3 (Negative)' },
  { idx: 4, name: 'CO-4 (Vibration)' },
  { idx: 5, name: 'CO-5 (Female)' },
  { idx: 6, name: 'CO-6 (Male)' },
  { idx: 7, name: 'CO-7 (Rhythm)' },
  { idx: 8, name: 'CO-8 (Above/Cause)' },
  { idx: 9, name: 'CO-9 (Below/Effect)' },
];

const DOMAIN_LABELS = [
  { idx: 0, name: 'Principled (P)' },
  { idx: 1, name: 'Cognitive (C)' },
  { idx: 2, name: 'Evaluative (E)' },
  { idx: 3, name: 'Operational (O)' },
];

const CALIBRATION_DISPOSITIONS: Array<{
  value: ValidationCalibrationDisposition;
  label: string;
  help: string;
}> = [
  {
    value: 'needs_more_review',
    label: 'Needs more review',
    help: 'Flag the disagreement without choosing a winner yet.',
  },
  {
    value: 'resolved_panel',
    label: 'Accept panel consensus',
    help: 'Use the human panel as the working reference for this item.',
  },
  {
    value: 'resolved_machine',
    label: 'Accept machine profile',
    help: 'Record that the machine score should stand for this item.',
  },
  {
    value: 'rubric_clarification',
    label: 'Rubric clarification needed',
    help: 'The disagreement points to unclear scoring guidance.',
  },
  {
    value: 'false_positive',
    label: 'Machine likely false positive',
    help: 'The machine appears too severe compared with the human panel.',
  },
  {
    value: 'false_negative',
    label: 'Machine likely false negative',
    help: 'The machine appears too lenient compared with the human panel.',
  },
];

function scoreColor(score: number): string {
  if (score <= 3) return '#ff7b72';
  if (score <= 6) return '#f59e0b';
  return '#37f5a0';
}

function calibrationDeltaColor(delta: number): string {
  const absDelta = Math.abs(delta);
  if (absDelta < 1.5) return '#37f5a0';
  if (absDelta < 3) return '#f59e0b';
  return '#ff7b72';
}

function roundedScoreArray(values: number[] | undefined, count: number): number[] {
  const base = Array(count).fill(5);
  if (!values?.length) return base;
  return base.map((fallback, idx) => {
    const value = values[idx];
    if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
    return Math.max(0, Math.min(10, Math.round(value)));
  });
}

function ScoreSlider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const color = scoreColor(value);
  return (
    <div className="flex items-center gap-3">
      <span className="w-44 shrink-0 font-mono text-[11px] text-[#eaf3ee]">{label}</span>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1"
        style={{ accentColor: color }}
      />
      <span
        className="w-8 text-center font-mono text-xs font-bold tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
    </div>
  );
}

type ComparisonData = {
  machine_scores: number[];
  machine_domain_averages: number[] | null;
  human_scores: number[];
  human_domain_scores: number[];
};

function CalibrationQueueButton({
  item,
  active,
  onClick,
}: {
  item: ValidationCalibrationQueueItem;
  active: boolean;
  onClick: () => void;
}) {
  const gap = item.largest_operator_gap?.spread ?? 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[2px] border px-3 py-3 text-left transition-colors ${
        active
          ? 'border-[#37f5a0] bg-[#13201c]'
          : 'border-[#20302b] bg-[#0c1513] hover:border-[#eaf3ee]/50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-semibold text-[#eaf3ee]">Item {item.item_index}</span>
        <span className="rounded-[2px] border border-[#20302b] bg-[#050b0a] px-2 py-0.5 font-mono text-[10px] text-[#86958d]">
          {item.session_count} prior {item.session_count === 1 ? 'session' : 'sessions'}
        </span>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#b3c2ba]">{item.prompt_excerpt}</p>
      <div className="mt-3 flex flex-wrap gap-2 font-mono text-[10px] text-[#86958d]">
        <span>Gap {gap.toFixed(1)}</span>
        <span>Mean spread {item.mean_spread.toFixed(1)}</span>
        <span>{item.raters.join(', ')}</span>
      </div>
    </button>
  );
}

export function ValidationPage() {
  const [rater, setRater] = useState<string>(() => localStorage.getItem('nc_rater') || '');
  const [raterInput, setRaterInput] = useState<string>('');
  const [item, setItem] = useState<ValidationNextItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [operatorScores, setOperatorScores] = useState<number[]>(Array(10).fill(5));
  const [domainScores, setDomainScores] = useState<number[]>(Array(4).fill(5));
  const [submitting, setSubmitting] = useState(false);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [calibrationData, setCalibrationData] = useState<ValidationCalibrationSessionData | null>(null);
  const [calibrationLoading, setCalibrationLoading] = useState(false);
  const [calibrationError, setCalibrationError] = useState<Error | null>(null);
  const [selectedCalibrationIndex, setSelectedCalibrationIndex] = useState(0);
  const [calibrationDisposition, setCalibrationDisposition] =
    useState<ValidationCalibrationDisposition>('needs_more_review');
  const [calibrationNotes, setCalibrationNotes] = useState('');
  const [includeResolvedScores, setIncludeResolvedScores] = useState(false);
  const [resolvedOperatorScores, setResolvedOperatorScores] = useState<number[]>(Array(10).fill(5));
  const [resolvedDomainScores, setResolvedDomainScores] = useState<number[]>(Array(4).fill(5));
  const [calibrationSubmitting, setCalibrationSubmitting] = useState(false);
  const [calibrationSaved, setCalibrationSaved] = useState(false);

  const loadNext = useCallback(async (forRater: string) => {
    setLoading(true);
    setError(null);
    setComparison(null);
    try {
      const next = await getValidationNext(forRater);
      setItem(next);
      setOperatorScores(Array(10).fill(5));
      setDomainScores(Array(4).fill(5));
    } catch (e) {
      setError(e as Error);
    }
    setLoading(false);
  }, []);

  const loadCalibration = useCallback(async () => {
    setCalibrationLoading(true);
    setCalibrationError(null);
    try {
      const next = await getValidationCalibrationSession();
      setCalibrationData(next);
      setSelectedCalibrationIndex((current) => {
        if (!next.queue.length) return 0;
        return Math.min(current, next.queue.length - 1);
      });
    } catch (e) {
      setCalibrationError(e as Error);
    }
    setCalibrationLoading(false);
  }, []);

  useEffect(() => {
    if (rater) {
      loadNext(rater);
      loadCalibration();
    }
  }, [rater, loadNext, loadCalibration]);

  const selectedCalibrationItem = useMemo<ValidationCalibrationQueueItem | null>(
    () => calibrationData?.queue?.[selectedCalibrationIndex] ?? null,
    [calibrationData, selectedCalibrationIndex],
  );

  useEffect(() => {
    if (!selectedCalibrationItem) {
      setCalibrationDisposition('needs_more_review');
      setCalibrationNotes('');
      setIncludeResolvedScores(false);
      setResolvedOperatorScores(Array(10).fill(5));
      setResolvedDomainScores(Array(4).fill(5));
      return;
    }
    setCalibrationDisposition('needs_more_review');
    setCalibrationNotes('');
    setIncludeResolvedScores(false);
    setResolvedOperatorScores(roundedScoreArray(selectedCalibrationItem.panel_operator_scores, 10));
    setResolvedDomainScores(roundedScoreArray(selectedCalibrationItem.panel_domain_scores, 4));
  }, [selectedCalibrationItem]);

  const handleSetRater = () => {
    const name = raterInput.trim();
    if (!name) return;
    localStorage.setItem('nc_rater', name);
    setRater(name);
  };

  const handleSubmit = async () => {
    if (!item || item.item_index === null) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await postValidationLabel({
        item_index: item.item_index,
        rater,
        operator_scores: operatorScores,
        domain_scores: domainScores,
      });
      setComparison({
        machine_scores: res.machine_scores ?? [],
        machine_domain_averages: res.machine_domain_averages,
        human_scores: [...operatorScores],
        human_domain_scores: [...domainScores],
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 1500);
      await loadCalibration();
    } catch (e) {
      setError(e as Error);
    }
    setSubmitting(false);
  };

  const handleNext = () => {
    setComparison(null);
    loadNext(rater);
  };

  const handleSkip = () => {
    loadNext(rater);
  };

  const handleSaveCalibration = async () => {
    if (!selectedCalibrationItem) return;
    setCalibrationSubmitting(true);
    setCalibrationError(null);
    try {
      await postValidationCalibrationSession({
        item_index: selectedCalibrationItem.item_index,
        reconciler: rater,
        disposition: calibrationDisposition,
        notes: calibrationNotes,
        resolved_operator_scores: includeResolvedScores ? resolvedOperatorScores : null,
        resolved_domain_scores: includeResolvedScores ? resolvedDomainScores : null,
      });
      setCalibrationSaved(true);
      setTimeout(() => setCalibrationSaved(false), 1600);
      await loadCalibration();
    } catch (e) {
      setCalibrationError(e as Error);
    }
    setCalibrationSubmitting(false);
  };

  if (!rater) {
    return (
      <div className="mx-auto max-w-md space-y-4 pt-6">
        <HowItWorksPanel sections={HOW_IT_WORKS_SECTIONS} label="How This Works" />
        <ResearchPrototypeNotice compact />
        <Card title="Who is validating?">
          <div className="space-y-3">
            <p className="text-[12px] text-[#b3c2ba]">Enter reviewer name.</p>
            <input
              type="text"
              value={raterInput}
              onChange={(e) => setRaterInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSetRater()}
              placeholder="Your name"
              className="min-h-[44px] w-full rounded-[2px] border border-[#20302b] bg-[#050b0a] px-4 py-3 text-base text-[#eaf3ee] placeholder:text-[#86958d] focus:border-[#37f5a0] focus:outline-none"
            />
            <button
              onClick={handleSetRater}
              disabled={!raterInput.trim()}
              className="min-h-[44px] w-full rounded-[2px] bg-[#37f5a0] px-4 py-3 text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Start Validating
            </button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 pb-16">
      <HowItWorksPanel sections={HOW_IT_WORKS_SECTIONS} label="How This Works" />
      <ResearchPrototypeNotice compact />

      <Disclosure summary="Protocol note">
        <p>
          This page is part of the documented validation protocol in{' '}
          <code className="font-mono text-[#37f5a0]">validation/VALIDATION_PROTOCOL.md</code>. Collect independent human
          scores here, then use the calibration session queue to review disagreements without leaving the workflow.
        </p>
      </Disclosure>

      <Card title="Calibration Session">
        <div className="space-y-4">
          <Disclosure summary="About calibration sessions">
            <p>
              Review disputed items with multiple human ratings, compare them with the machine profile, and log
              a durable reconciliation note. This is the review trail stakeholders will expect when they ask how
              disagreements were handled.
            </p>
          </Disclosure>
          <ErrorBanner error={calibrationError} />

          {calibrationLoading ? (
            <LoadingSpinner />
          ) : !calibrationData || calibrationData.queue.length === 0 ? (
            <p className="text-[11px] text-[#86958d]">
              No multi-rater disagreements are queued yet. Collect at least two ratings on the same item to
              start a calibration session.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-[280px_minmax(0,1fr)]">
                <div className="space-y-2">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                    Disagreement Queue
                  </p>
                  {calibrationData.queue.map((queueItem, idx) => (
                    <CalibrationQueueButton
                      key={queueItem.item_index}
                      item={queueItem}
                      active={idx === selectedCalibrationIndex}
                      onClick={() => setSelectedCalibrationIndex(idx)}
                    />
                  ))}
                </div>

                {selectedCalibrationItem ? (
                  <div className="space-y-4 rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#37f5a0]">
                          Active Review
                        </p>
                        <h2 className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                          Item {selectedCalibrationItem.item_index} · {selectedCalibrationItem.model || 'unknown model'}
                        </h2>
                      </div>
                      <div className="flex flex-wrap gap-2 font-mono text-[10px] text-[#86958d]">
                        <span className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2 py-0.5">
                          Largest gap {selectedCalibrationItem.largest_operator_gap?.operator_name ?? 'n/a'}
                        </span>
                        <span className="rounded-[2px] border border-[#20302b] bg-[#0c1513] px-2 py-0.5">
                          Machine-panel gap {selectedCalibrationItem.machine_panel_gap.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[2px] border border-[#20302b] bg-[#050b0a] p-3">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">Prompt</p>
                        <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-[#b3c2ba]">
                          {selectedCalibrationItem.prompt}
                        </p>
                      </div>
                      <div className="rounded-[2px] border border-[#20302b] bg-[#050b0a] p-3">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">Response</p>
                        <p className="mt-2 max-h-44 overflow-y-auto whitespace-pre-wrap text-[12px] leading-relaxed text-[#b3c2ba]">
                          {selectedCalibrationItem.response || '(no response recorded)'}
                        </p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-[2px] border border-[#20302b] bg-[#0c1513]">
                      <table className="min-w-full divide-y divide-[#20302b] text-[11px]">
                        <thead className="bg-[#050b0a] font-mono text-[#86958d]">
                          <tr>
                            <th className="px-3 py-2 text-left font-semibold">Operator</th>
                            <th className="px-3 py-2 text-right font-semibold">Panel</th>
                            <th className="px-3 py-2 text-right font-semibold">Machine</th>
                            {selectedCalibrationItem.labels.map((label) => (
                              <th key={label.rater} className="px-3 py-2 text-right font-semibold">
                                {label.rater}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#20302b]">
                          {OPERATOR_LABELS.map((op) => {
                            const panel = selectedCalibrationItem.panel_operator_scores[op.idx] ?? 0;
                            const machine = selectedCalibrationItem.machine_operator_scores[op.idx] ?? 0;
                            return (
                              <tr key={op.idx}>
                                <td className="px-3 py-2 text-[#eaf3ee]">{op.name}</td>
                                <td className="px-3 py-2 text-right font-mono text-[#eaf3ee]">{panel.toFixed(1)}</td>
                                <td
                                  className="px-3 py-2 text-right font-mono font-semibold"
                                  style={{ color: calibrationDeltaColor(panel - machine) }}
                                >
                                  {machine.toFixed(1)}
                                </td>
                                {selectedCalibrationItem.labels.map((label) => {
                                  const score = label.operator_scores[op.idx] ?? 0;
                                  return (
                                    <td
                                      key={`${label.rater}-${op.idx}`}
                                      className="px-3 py-2 text-right font-mono"
                                      style={{ color: calibrationDeltaColor(score - panel) }}
                                    >
                                      {score.toFixed(1)}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-[2px] border border-[#20302b] bg-[#050b0a] p-3">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                          Domain Snapshot
                        </p>
                        <div className="mt-3 space-y-2">
                          {DOMAIN_LABELS.map((domain) => (
                            <div key={domain.idx} className="grid grid-cols-[1.6fr,0.8fr,0.8fr,1fr] items-center gap-2 text-[11px]">
                              <span className="text-[#eaf3ee]">{domain.name}</span>
                              <span className="text-right font-mono text-[#eaf3ee]">
                                {selectedCalibrationItem.panel_domain_scores[domain.idx]?.toFixed(1)}
                              </span>
                              <span className="text-right font-mono text-[#b3c2ba]">
                                {selectedCalibrationItem.machine_domain_scores[domain.idx]?.toFixed(1)}
                              </span>
                              <span className="text-right font-mono text-[#86958d]">
                                {selectedCalibrationItem.labels.map((label) => label.domain_scores[domain.idx]).join(' / ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="rounded-[2px] border border-[#20302b] bg-[#050b0a] p-3">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                          Resolution Log
                        </p>
                        <div className="mt-3 space-y-3">
                          <label className="block">
                            <span className="mb-1 block font-mono text-[11px] text-[#eaf3ee]">Disposition</span>
                            <select
                              value={calibrationDisposition}
                              onChange={(e) => setCalibrationDisposition(e.target.value as ValidationCalibrationDisposition)}
                              className="w-full rounded-[2px] border border-[#20302b] bg-[#0c1513] px-3 py-2 text-[12px] text-[#eaf3ee] focus:border-[#37f5a0] focus:outline-none"
                            >
                              {CALIBRATION_DISPOSITIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <span className="mt-1 block text-[10px] text-[#86958d]">
                              {CALIBRATION_DISPOSITIONS.find((option) => option.value === calibrationDisposition)?.help}
                            </span>
                          </label>

                          <label className="flex items-center gap-2 text-[11px] text-[#eaf3ee]">
                            <input
                              type="checkbox"
                              checked={includeResolvedScores}
                              onChange={(e) => setIncludeResolvedScores(e.target.checked)}
                              className="rounded-[2px] border-[#20302b] bg-[#0c1513] accent-[#37f5a0]"
                            />
                            Attach reconciled score snapshot
                          </label>

                          {includeResolvedScores ? (
                            <div className="space-y-3 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3">
                              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">
                                Reconciled operator scores
                              </p>
                              <div className="space-y-2">
                                {OPERATOR_LABELS.map((op) => (
                                  <ScoreSlider
                                    key={`resolved-${op.idx}`}
                                    label={op.name}
                                    value={resolvedOperatorScores[op.idx]}
                                    onChange={(v) => {
                                      const next = [...resolvedOperatorScores];
                                      next[op.idx] = v;
                                      setResolvedOperatorScores(next);
                                    }}
                                  />
                                ))}
                              </div>
                              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[#86958d]">
                                Reconciled domain scores
                              </p>
                              <div className="space-y-2">
                                {DOMAIN_LABELS.map((domain) => (
                                  <ScoreSlider
                                    key={`resolved-domain-${domain.idx}`}
                                    label={domain.name}
                                    value={resolvedDomainScores[domain.idx]}
                                    onChange={(v) => {
                                      const next = [...resolvedDomainScores];
                                      next[domain.idx] = v;
                                      setResolvedDomainScores(next);
                                    }}
                                  />
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <label className="block">
                            <span className="mb-1 block font-mono text-[11px] text-[#eaf3ee]">Reconciliation notes</span>
                            <textarea
                              value={calibrationNotes}
                              onChange={(e) => setCalibrationNotes(e.target.value)}
                              rows={5}
                              placeholder="What drove the disagreement? Which rubric wording should change? What should the next rater watch for?"
                              className="w-full rounded-[2px] border border-[#20302b] bg-[#0c1513] px-3 py-2 text-[12px] text-[#eaf3ee] placeholder:text-[#86958d] focus:border-[#37f5a0] focus:outline-none"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={handleSaveCalibration}
                            disabled={calibrationSubmitting}
                            className="w-full rounded-[2px] bg-[#37f5a0] px-4 py-3 text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90 disabled:opacity-40"
                          >
                            {calibrationSubmitting
                              ? 'Saving calibration...'
                              : calibrationSaved
                                ? 'Saved calibration'
                                : 'Save calibration session'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                    Recent Calibration Sessions
                  </p>
                  <span className="font-mono text-[10px] text-[#86958d]">{calibrationData.recent_sessions.length} saved</span>
                </div>
                {calibrationData.recent_sessions.length === 0 ? (
                  <p className="mt-3 text-[11px] text-[#86958d]">No reconciliation notes saved yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {calibrationData.recent_sessions.slice(0, 6).map((entry) => (
                      <div
                        key={`${entry.timestamp}-${entry.item_index}-${entry.reconciler}`}
                        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-mono text-[11px] font-semibold text-[#eaf3ee]">
                            Item {entry.item_index} · {entry.reconciler}
                          </span>
                          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#37f5a0]">
                            {entry.disposition.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-[#86958d]">{entry.timestamp}</p>
                        {entry.notes ? (
                          <p className="mt-2 text-[11px] leading-relaxed text-[#b3c2ba]">{entry.notes}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between rounded-[2px] border border-[#20302b] bg-[#0c1513] p-4">
        <div>
          <h1 className="font-['Space_Grotesk',sans-serif] text-xl font-bold text-[#eaf3ee]">Human Validation</h1>
          <p className="font-mono text-[11px] text-[#86958d]">
            Rater: <span className="text-[#37f5a0]">{rater}</span>
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem('nc_rater');
            setRater('');
            setRaterInput('');
          }}
          className="min-h-[44px] rounded-[2px] border border-[#eaf3ee] bg-transparent px-3 py-2 text-xs font-semibold text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
        >
          Quit and save
        </button>
      </div>

      {loading ? <LoadingSpinner /> : null}
      <ErrorBanner error={error} />

      {item && item.item_index !== null ? (
        <>
          <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[11px] font-semibold text-[#eaf3ee]">
                Item {item.rater_progress + 1} of {item.total_items}
              </span>
              <span className="font-mono text-[10px] text-[#86958d]">{item.model}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-[2px] bg-[#13201c]">
              <div
                className="h-full bg-[#37f5a0] transition-all duration-300"
                style={{ width: `${((item.rater_progress + 1) / Math.max(1, item.total_items)) * 100}%` }}
              />
            </div>
          </div>

          <Card title="Prompt">
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#eaf3ee]">{item.prompt}</p>
          </Card>

          <Card title="AI Response">
            <div className="max-h-80 overflow-y-auto">
              <p className="whitespace-pre-wrap text-[12px] leading-relaxed text-[#b3c2ba]">
                {item.response || '(no response recorded)'}
              </p>
            </div>
          </Card>

          {!comparison ? (
            <>
              <Card title="Score each Cognitive Operator (0-10)">
                <div className="space-y-3">
                  {OPERATOR_LABELS.map((op) => (
                    <ScoreSlider
                      key={op.idx}
                      label={op.name}
                      value={operatorScores[op.idx]}
                      onChange={(v) => {
                        const next = [...operatorScores];
                        next[op.idx] = v;
                        setOperatorScores(next);
                      }}
                    />
                  ))}
                </div>
              </Card>

              <Card title="Score each Processing Domain (0-10)">
                <div className="space-y-3">
                  {DOMAIN_LABELS.map((domain) => (
                    <ScoreSlider
                      key={domain.idx}
                      label={domain.name}
                      value={domainScores[domain.idx]}
                      onChange={(v) => {
                        const next = [...domainScores];
                        next[domain.idx] = v;
                        setDomainScores(next);
                      }}
                    />
                  ))}
                </div>
              </Card>

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="min-h-[44px] flex-1 rounded-[2px] bg-[#37f5a0] px-6 py-3 text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {submitting ? 'Saving...' : justSaved ? 'Saved' : 'Submit and reveal machine scores'}
                </button>
                <button
                  onClick={handleSkip}
                  className="min-h-[44px] rounded-[2px] border border-[#eaf3ee] bg-transparent px-4 py-3 text-sm font-semibold text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
                >
                  Skip
                </button>
              </div>
            </>
          ) : (
            <>
              <Card title="Your Score vs Machine Score">
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 border-b border-[#20302b] pb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#86958d]">
                    <div className="col-span-6">Operator</div>
                    <div className="col-span-2 text-right">You</div>
                    <div className="col-span-2 text-right">Machine</div>
                    <div className="col-span-2 text-right">Delta</div>
                  </div>
                  {OPERATOR_LABELS.map((op) => {
                    const human = comparison.human_scores[op.idx];
                    const machine = comparison.machine_scores[op.idx] ?? 0;
                    const delta = human - machine;
                    return (
                      <div key={op.idx} className="grid grid-cols-12 items-center gap-2 py-1.5">
                        <div className="col-span-6 font-mono text-[11px] text-[#eaf3ee]">{op.name}</div>
                        <div className="col-span-2 text-right font-mono text-[11px] text-[#eaf3ee]">{human.toFixed(1)}</div>
                        <div className="col-span-2 text-right font-mono text-[11px] text-[#b3c2ba]">{machine.toFixed(1)}</div>
                        <div
                          className="col-span-2 text-right font-mono text-[11px] font-bold"
                          style={{ color: calibrationDeltaColor(delta) }}
                        >
                          {delta >= 0 ? '+' : ''}
                          {delta.toFixed(1)}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-[10px] text-[#86958d]">
                  Small deltas indicate close agreement. Large deltas should be reviewed in the calibration queue.
                </p>
              </Card>

              <button
                onClick={handleNext}
                className="min-h-[44px] w-full rounded-[2px] bg-[#37f5a0] px-6 py-3 text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90"
              >
                Next item
              </button>
            </>
          )}
        </>
      ) : null}

      {item && item.item_index === null ? (
        <Card>
          <p className="py-8 text-center text-[#eaf3ee]">You have validated every item currently available.</p>
          <p className="text-center text-[11px] text-[#86958d]">
            Check the{' '}
            <a href="/validation/leaderboard" className="text-[#37f5a0] hover:underline">
              leaderboard
            </a>{' '}
            for agreement metrics and evidence summaries.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
