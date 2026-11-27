import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useScrollSpy } from '../hooks/useScrollSpy';
import { SectionReveal } from '../components/shared/SectionReveal';
import { CircuitCard } from '../components/shared/CircuitCard';
import { InterpretButton } from '../components/shared/InterpretButton';
import {
  OPERATOR_LABELS,
  DOMAIN_LABELS,
  DRIVE_LABELS,
  INVERSION_AXIS_LABELS,
  NCCS_WEIGHTS,
  PIPELINE_STAGES,
  INVOLUTION_PAIRS,
  DRIVE_INVERSION_PAIRS,
  CERTIFICATION_THRESHOLDS,
} from '../lib/constants';
import { CERT_COLORS, DOMAIN_COLORS, DRIVE_COLORS } from '../lib/colors';

const CAS_COMPILER_URL = 'https://www.caslabai.com/compiler/';

const SECTIONS = [
  { id: 'big-picture', label: 'The Big Picture' },
  { id: 'everyday', label: 'Everyday Examples' },
  { id: 'operators', label: '10 Noetics' },
  { id: 'registers', label: '4 Registers' },
  { id: 'domains', label: 'Processing Domains' },
  { id: 'drives', label: 'Core Drives' },
  { id: 'rpm', label: 'RPM Model' },
  { id: 'inversions', label: 'Inversion Detection' },
  { id: 'nccs', label: 'NCCS Scoring' },
  { id: 'math', label: 'The Math' },
  { id: 'science', label: 'The Science' },
  { id: 'tools', label: 'Tools' },
] as const;

const REGISTERS = [
  {
    code: '|T',
    name: 'Transcendent',
    summary: 'Higher-order principles, meta-framing, and existential or universal orientation.',
  },
  {
    code: '|A',
    name: 'Analytical',
    summary: 'Explicit formal logic, structured decomposition, and propositional reasoning.',
  },
  {
    code: '|f',
    name: 'Affective',
    summary: 'Valence, salience, felt urgency, and motivational weighting (canonical lowercase f).',
  },
  {
    code: '|E',
    name: 'Embodied',
    summary: 'Concrete physical execution, somatic constraint, and real-world operational grounding.',
  },
] as const;

const SECTION_IDS = SECTIONS.map((s) => s.id);

const SELF_DUALS = new Set([0, 1, 4, 7]);

function involutionPartner(idx: number): number | null {
  for (const [a, b] of INVOLUTION_PAIRS) {
    if (idx === a) return b;
    if (idx === b) return a;
  }
  return null;
}

function drivePartner(idx: number): number | null {
  for (const [a, b] of DRIVE_INVERSION_PAIRS) {
    if (idx === a) return b;
    if (idx === b) return a;
  }
  return null;
}

const WEIGHT_ENTRIES = Object.entries(NCCS_WEIGHTS).map(([key, value]) => ({
  label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  pct: Math.round(value * 100),
}));

const WEIGHT_COLORS = ['#37f5a0', '#60a5fa', '#a78bfa', '#f59e0b', '#f472b6', '#34d399'];

export function HowItWorksPage() {
  const activeId = useScrollSpy(SECTION_IDS);

  const certEntries = useMemo(
    () =>
      Object.entries(CERTIFICATION_THRESHOLDS).map(([tier, min]) => ({
        tier,
        min,
        color: CERT_COLORS[tier] ?? '#ff7b72',
      })),
    [],
  );

  return (
    <div className="mx-auto max-w-3xl">
      {/* Page header */}
      <div className="mb-6 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          CAS Lab · Architecture Reference
        </p>
        <h1 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
          How CAS Compass Works
        </h1>
        <p className="mt-2 text-sm text-[#b3c2ba]">
          A guided tour of the Cognitive Architecture System (CAS) — from pipeline to formal math.
        </p>
      </div>

      {/* Horizontal section nav */}
      <nav className="sticky top-0 z-10 -mx-1 mb-10 border-y border-[#20302b] bg-[#050b0a] py-2">
        <div className="flex flex-wrap gap-1.5 px-1">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`rounded-[2px] border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                activeId === s.id
                  ? 'border-[#37f5a0] bg-[#37f5a0] font-semibold text-[#050b0a]'
                  : 'border-[#20302b] bg-[#0c1513] text-[#86958d] hover:border-[#eaf3ee]/50 hover:text-[#eaf3ee]'
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Content */}
      <div className="space-y-16 pb-24">
        {/* 1 — Big Picture */}
        <SectionReveal>
          <section id="big-picture" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              01 · Pipeline
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              The Big Picture
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              The Cognitive Architecture System (CAS) evaluates AI responses for cognitive
              architecture integrity and coherence. Every prompt passes through an 8-stage
              pipeline, producing a composite{' '}
              <strong className="text-[#eaf3ee]">NCCS score</strong> (0–100).
            </p>
            <div className="overflow-x-auto rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
              <div className="flex min-w-[600px] items-center gap-2">
                {PIPELINE_STAGES.map((stage, i) => (
                  <div key={stage} className="flex items-center gap-2">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-20 items-center justify-center rounded-[2px] border border-[#20302b] bg-[#13201c]">
                        <span className="px-1 text-center text-[10px] font-medium leading-tight text-[#eaf3ee]">
                          {stage}
                        </span>
                      </div>
                      <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[#86958d]">
                        Stage {i + 1}
                      </span>
                    </div>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <svg width="16" height="10" className="shrink-0 text-[#37f5a0]/70">
                        <path
                          d="M0 5h12m-4-4l4 4-4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </SectionReveal>

        {/* 2 — Everyday Examples */}
        <SectionReveal>
          <section id="everyday" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              02 · Circuits
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              How Cognitive Operators Work in Everyday Life
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              The same cognitive dynamics that CAS measures in AI systems happen in human
              decision-making every day. These four examples show how operators combine into
              circuits — and what we look for when we assess an AI.
            </p>
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <CircuitCard
                title="The Morning Decision Amplifier"
                operators="CO-2 (Positive) + CO-4 (Vibration) → Action"
                nodes={[
                  { label: 'CO-2', sublabel: 'Positive', color: '#60a5fa' },
                  { label: 'Sensory', sublabel: 'Environment', color: '#a78bfa' },
                  { label: 'CO-4', sublabel: 'Vibration', color: '#37f5a0' },
                  { label: 'Action', sublabel: 'Output', color: '#34d399' },
                ]}
                description="A passing constructive pull gets amplified by environmental triggers until it becomes an overwhelming impulse. You smell coffee, and a vague positive cue (CO-2) combines with sensory input while Vibration (CO-4) raises its encoding intensity until action feels inevitable."
                calloutOperator="CO-4 (Vibration)"
                callout="We measure whether the AI calibrates signal intensity appropriately — or whether it over-amplifies minor cues into dominant responses."
              />
              <CircuitCard
                title="The Friction Inhibitor"
                operators="CO-2 (Positive) dampened by CO-3 (Negative)"
                nodes={[
                  { label: 'CO-2', sublabel: 'Positive', color: '#60a5fa' },
                  { label: 'CO-3', sublabel: 'Negative', color: '#ff7b72' },
                  { label: 'Constraint', sublabel: 'Environment', color: '#a78bfa' },
                  { label: 'Inhibited', sublabel: 'Suppressed', color: '#86958d' },
                ]}
                description="You reach for your phone during a meeting, but social awareness stops you. The positive attraction (CO-2) is dampened by Negative resistance and critique (CO-3) working with environmental constraints. Healthy cognition includes the ability to refuse or suppress impulses when conditions aren't right."
                calloutOperator="CO-3 (Negative)"
                callout="We measure whether an AI can exercise restraint — CO-3 (Negative) acting as a natural involution brake on CO-2 (Positive). Systems that cannot inhibit impulses score poorly on involution balance."
              />
              <CircuitCard
                title="The Momentum Builder"
                operators="RPM Chain: A0 → D → W → P + CO-7 (Rhythm) feedback"
                nodes={[
                  { label: 'A0', sublabel: 'Pure Desire', color: '#37f5a0' },
                  { label: 'Dn', sublabel: 'Desire', color: '#60a5fa' },
                  { label: 'Wn', sublabel: 'Wisdom', color: '#a78bfa' },
                  { label: 'Pn', sublabel: 'Power', color: '#f59e0b' },
                ]}
                feedbackTo={0}
                description="The first day at the gym is the hardest. Each completed session lowers the threshold for the next one. Success builds through the prerequisite chain — CO-7 (Rhythm) establishes a recurring feedback cycle that makes each step steadier than the last."
                calloutOperator="RPM Prerequisites"
                callout="We measure whether AI systems have intact prerequisite chains or whether they try to skip steps. A system that jumps from pure desire (A0) straight to power (Pn) without building wisdom (Wn) has a broken RPM chain."
              />
              <CircuitCard
                title="The Creative Flow State"
                operators="CO-0 (Idea) → CO-6 (Male) → CO-0 oscillation via CO-7 (Rhythm)"
                nodes={[
                  { label: 'CO-0', sublabel: 'Idea', color: '#37f5a0' },
                  { label: 'CO-6', sublabel: 'Male', color: '#f472b6' },
                  { label: 'CO-7', sublabel: 'Rhythm', color: '#f59e0b' },
                  { label: 'CO-0', sublabel: 'Idea', color: '#37f5a0' },
                ]}
                feedbackTo={0}
                description="A musician improvising, a writer in flow — creative states are self-sustaining cycles between generating an Idea (CO-0) and projecting it outward via Male assertion (CO-6), regulated by Rhythm (CO-7). Each expression seeds the next idea."
                calloutOperator="CO-0 ↔ CO-6 oscillation"
                callout="We measure whether AI can sustain this generative cycle or whether it collapses into repetitive patterns. A healthy CO-0/CO-6 oscillation produces novelty; a broken one produces loops."
              />
            </div>
          </section>
        </SectionReveal>

        {/* 3 — Cognitive Operators (10 Canonical Noetics) */}
        <SectionReveal>
          <section id="operators" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              03 · Canonical Noetics
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              10 Cognitive Operators (Noetics)
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Each canonical Noetic operator (CO-0 through CO-9) captures a distinct cognitive
              function. They form a monoid with <strong className="text-[#eaf3ee]">CO-0 (Idea)</strong>{' '}
              as identity. Three involution pairs exist (Positive↔Negative, Female↔Male,
              Above/Cause↔Below/Effect); four are self-dual.
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {OPERATOR_LABELS.map((label, i) => {
                const partner = involutionPartner(i);
                const isSelfDual = SELF_DUALS.has(i);
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-1.5 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3 text-center"
                  >
                    <span className="font-mono text-xs font-bold text-[#37f5a0]">CO-{i}</span>
                    <span className="text-xs font-medium text-[#eaf3ee]">
                      {label.split(': ')[1]}
                    </span>
                    {isSelfDual && (
                      <span className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#86958d]">
                        self-dual
                      </span>
                    )}
                    {partner !== null && (
                      <span className="rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] px-1.5 py-0.5 font-mono text-[9px] text-[#37f5a0]">
                        ↔ CO-{partner}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </SectionReveal>

        {/* 4 — 4 Registers */}
        <SectionReveal>
          <section id="registers" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              04 · Registers
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              4 Registers
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Registers modulate how a Noetic operator expresses itself. Canonical notation uses
              exact case — note lowercase <code className="font-mono text-[#37f5a0]">|f</code> for
              Affective.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {REGISTERS.map((reg) => (
                <div
                  key={reg.code}
                  className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-4"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="rounded-[2px] border border-[#37f5a0]/40 bg-[#13201c] px-2 py-0.5 font-mono text-xs font-bold text-[#37f5a0]">
                      {reg.code}
                    </span>
                    <span className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      {reg.name}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[#b3c2ba]">{reg.summary}</p>
                </div>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* 5 — Processing Domains */}
        <SectionReveal>
          <section id="domains" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              05 · Domains
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              4 Processing Domains
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Domains impose a strict total order: P ≻ C ≻ E ≻ O. Causation descends from
              Principled to Operational; feedback loops from Operational back to Principled.
            </p>
            <div className="flex flex-col items-center gap-0">
              {DOMAIN_LABELS.map((d, i) => (
                <div key={d} className="flex flex-col items-center">
                  <div
                    className="flex items-center gap-3 rounded-[2px] border bg-[#0c1513] px-6 py-3"
                    style={{ borderColor: `${DOMAIN_COLORS[i]}66` }}
                  >
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-[2px] font-mono text-xs font-bold"
                      style={{ background: `${DOMAIN_COLORS[i]}20`, color: DOMAIN_COLORS[i] }}
                    >
                      {d[0]}
                    </span>
                    <span className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      {d}
                    </span>
                  </div>
                  {i < DOMAIN_LABELS.length - 1 && (
                    <svg width="14" height="24" className="my-0.5 text-[#86958d]">
                      <path
                        d="M7 0v18m-4-4l4 4 4-4"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.2"
                      />
                    </svg>
                  )}
                </div>
              ))}
              <div className="mt-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#86958d]">
                <svg width="14" height="14">
                  <path
                    d="M10 2C4 2 2 7 2 12m0 0l3-3m-3 3l-3-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                </svg>
                O → P feedback loop
              </div>
            </div>
          </section>
        </SectionReveal>

        {/* 6 — Core Drives */}
        <SectionReveal>
          <section id="drives" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              06 · Drives
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              7 Core Drives
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Seven fundamental motivational drives, each with an inversion partner. F4
              (Connection) is the self-dual center. Crossed with 4 domains gives 28 domain-specific
              drives.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DRIVE_LABELS.map((label, i) => {
                const partner = drivePartner(i);
                const isSelfDual = i === 3; // F4
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-4"
                    style={{ borderLeftColor: DRIVE_COLORS[i], borderLeftWidth: '2px' }}
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] font-mono text-xs font-bold"
                      style={{ background: `${DRIVE_COLORS[i]}15`, color: DRIVE_COLORS[i] }}
                    >
                      F{i + 1}
                    </span>
                    <div>
                      <span className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                        {label.split(': ')[1]}
                      </span>
                      <div className="mt-1 font-mono text-[10px] text-[#86958d]">
                        {isSelfDual ? (
                          <span className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-1.5 py-0.5 uppercase">
                            self-dual
                          </span>
                        ) : partner !== null ? (
                          <span
                            className="rounded-[2px] px-1.5 py-0.5"
                            style={{
                              background: `${DRIVE_COLORS[partner]}15`,
                              color: DRIVE_COLORS[partner],
                            }}
                          >
                            ↔ F{partner + 1}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </SectionReveal>

        {/* 7 — RPM Model */}
        <SectionReveal>
          <section id="rpm" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              07 · Prerequisites
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              RPM Prerequisite Model
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              The Recursive Prerequisite Model uses a{' '}
              <strong className="text-[#eaf3ee]">section-retraction</strong>, not an adjunction.
              Prerequisite satisfaction is one-directional: realization after embedding equals
              identity, but re-embedding after realization may lose information.
            </p>
            <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
              <div className="flex flex-wrap items-center justify-center gap-3">
                {['A0', 'D', 'W', 'P', 'Outcome'].map((node, i, arr) => (
                  <div key={node} className="flex items-center gap-3">
                    <div
                      className={`rounded-[2px] border px-4 py-2 font-mono text-xs font-semibold ${
                        node === 'A0'
                          ? 'border-[#37f5a0] bg-[#13201c] text-[#37f5a0]'
                          : node === 'Outcome'
                            ? 'border-[#37f5a0]/50 bg-[#13201c] text-[#eaf3ee]'
                            : 'border-[#20302b] bg-[#13201c] text-[#b3c2ba]'
                      }`}
                    >
                      {node === 'A0'
                        ? 'A0 (Pure Desire)'
                        : node === 'D'
                          ? 'Dn (Desire)'
                          : node === 'W'
                            ? 'Wn (Wisdom)'
                            : node === 'P'
                              ? 'Pn (Power)'
                              : node}
                    </div>
                    {i < arr.length - 1 && (
                      <svg width="20" height="10" className="shrink-0 text-[#37f5a0]/70">
                        <path
                          d="M0 5h16m-4-4l4 4-4 4"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.2"
                        />
                      </svg>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 space-y-1 text-center font-mono text-[11px] text-[#86958d]">
                <p>
                  <code className="text-[#37f5a0]">εI ∘ ηI = idI</code> — realization after
                  embedding = identity
                </p>
                <p>
                  <code className="text-[#ff7b72]">ηI ∘ εI ≠ idR(I)</code> — re-embedding may lose
                  information
                </p>
              </div>
            </div>
          </section>
        </SectionReveal>

        {/* 8 — Inversion Detection */}
        <SectionReveal>
          <section id="inversions" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              08 · Inversions
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              Inversion Detection
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Inversions are cognitive distortions detected across 7 independent axes. The scanner
              also checks for <strong className="text-[#eaf3ee]">stealth inversions</strong> and
              compound severity.
            </p>
            <div className="space-y-2">
              {INVERSION_AXIS_LABELS.map((label, i) => {
                const [code, name] = label.split(': ');
                return (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-[2px] border border-[#20302b] bg-[#0c1513] px-4 py-3"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-[#20302b] bg-[#13201c] font-mono text-xs font-bold text-[#37f5a0]">
                      {code}
                    </span>
                    <div>
                      <span className="text-sm font-medium text-[#eaf3ee]">{name}</span>
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-[#86958d]">
                        Axis {i + 1}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </SectionReveal>

        {/* 9 — NCCS Scoring */}
        <SectionReveal>
          <section id="nccs" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              09 · Composite Metric
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              NCCS Scoring
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              The CAS Compass Composite Score (NCCS) combines six weighted sub-scores into a single
              0–100 metric.
            </p>

            {/* Stacked bar */}
            <div className="mb-6 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
              <div className="flex h-8 overflow-hidden rounded-[2px]">
                {WEIGHT_ENTRIES.map((e, i) => (
                  <div
                    key={e.label}
                    className="flex items-center justify-center font-mono text-[10px] font-bold text-[#050b0a]"
                    style={{ width: `${e.pct}%`, background: WEIGHT_COLORS[i] }}
                  >
                    {e.pct}%
                  </div>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                {WEIGHT_ENTRIES.map((e, i) => (
                  <span
                    key={e.label}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-[#b3c2ba]"
                  >
                    <span
                      className="h-2 w-2 rounded-[1px]"
                      style={{ background: WEIGHT_COLORS[i] }}
                    />
                    {e.label}
                  </span>
                ))}
              </div>
            </div>

            {/* Research tiers */}
            <h3 className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
              Research Tiers
            </h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {certEntries.map(({ tier, min, color }) => (
                <div
                  key={tier}
                  className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-3 text-center"
                >
                  <span className="font-['Space_Grotesk',sans-serif] text-lg font-bold" style={{ color }}>
                    {tier}
                  </span>
                  <p className="mt-1 font-mono text-[10px] text-[#86958d]">
                    {min === 0
                      ? '0–39'
                      : `${min}–${
                          tier === 'Platinum'
                            ? '100'
                            : (Object.values(CERTIFICATION_THRESHOLDS)[
                                Object.keys(CERTIFICATION_THRESHOLDS).indexOf(tier) - 1
                              ] as number) - 1
                        }`}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </SectionReveal>

        {/* 10 — The Math */}
        <SectionReveal>
          <section id="math" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              10 · Formal Geometry
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              The Math
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              CAS operates on the{' '}
              <strong className="text-[#eaf3ee]">open probability simplex</strong> — a
              39-dimensional manifold equipped with the Fisher-Rao metric.
            </p>
            <div className="space-y-4">
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                    State Space
                  </h4>
                  <InterpretButton interpretation="Imagine the AI's mind as a pie cut into 40 slices — each slice is one of the 40 cognitive states (10 Noetics × 4 Domains). At any moment, each slice has some size, and all 40 sizes add up to 100%. The word 'open' means every slice must have at least a tiny bit of pie — no slice can be completely empty. This 'pie of 40 slices where nothing is zero' is the space where every possible state lives, and it's what the rest of the math measures distances on." />
                </div>
                <code className="mb-3 block font-mono text-sm leading-relaxed text-[#37f5a0]">
                  {'S°_I = Δ°₃₉ = { p ∈ ℝ⁴⁰ : pₖ > 0 ∀k, Σpₖ = 1 }'}
                </code>
                <p className="text-xs leading-relaxed text-[#b3c2ba]">
                  For a 39-dimensional manifold, you need 40 components because the constraint
                  <code className="mx-1 font-mono text-[#eaf3ee]">Σpₖ = 1</code> removes one degree
                  of freedom. The <strong className="text-[#eaf3ee]">open</strong> simplex (
                  <code className="font-mono text-[#eaf3ee]">pₖ {'>'} 0</code>) ensures every
                  cognitive state always has a nonzero probability — no state is ever completely
                  absent from the model.
                </p>
              </div>
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                    Fisher-Rao Metric
                  </h4>
                  <InterpretButton interpretation="This is the yardstick we use to measure how different two states of mind are. What makes it special is that it pays way more attention to small changes in rare things than to small changes in common things. A tiny shift in a rare cognitive state is huge; the same shift in a dominant one is tiny. It's the most sensitive, fair way to tell 'how far' one profile is from another." />
                </div>
                <code className="mb-3 block font-mono text-sm leading-relaxed text-[#37f5a0]">
                  {'g^FR_p(u, v) = Σₖ (uₖ · vₖ) / pₖ'}
                </code>
                <p className="text-xs leading-relaxed text-[#b3c2ba]">
                  This is the standard Fisher Information Metric in coordinates. Think of it as the{' '}
                  <strong className="text-[#eaf3ee]">sensitivity</strong> of the system — it scales
                  the inner product by the inverse of the probability, making changes in small
                  probabilities far more significant than changes in large ones.
                </p>
              </div>
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                    Geodesic Distance
                  </h4>
                  <InterpretButton interpretation="A geodesic is the shortest path between two points on a curved surface. Here we treat each cognitive profile as a point on a unit hypersphere and measure the angle between them. Small distance means two profiles are closely aligned; large distance means they drifted apart." />
                </div>
                <code className="mb-3 block font-mono text-sm leading-relaxed text-[#37f5a0]">
                  {'d(p, q) = 2 · arccos( Σₖ √(pₖ · qₖ) )'}
                </code>
                <p className="text-xs leading-relaxed text-[#b3c2ba]">
                  This is the Bhattacharyya distance scaled for the sphere. The square-root
                  transform maps the probability simplex onto a portion of a unit hypersphere, so
                  the <strong className="text-[#eaf3ee]">shortest path</strong> (geodesic) between
                  two cognitive state distributions is simply the angle between them on that sphere.
                </p>
              </div>
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <h4 className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#86958d]">
                    Admissibility Relation
                  </h4>
                  <InterpretButton interpretation="Think of each Cognitive Operator (CO-0 through CO-9) as a move the mind can make — and this rule spells out which transitions are legal. The identity operator CO-0 (Idea) maps a state to itself, while other operators define broader legal transition sets." />
                </div>
                <code className="block font-mono text-sm leading-relaxed text-[#37f5a0]">
                  {'Dₖ ⊆ I × I — valid (source, target) pairs for operator CO-k'}
                </code>
                <code className="mt-1 mb-3 block font-mono text-sm text-[#86958d]">
                  {'D₀ = { (I, I) : I ∈ I } — identity on diagonal only'}
                </code>
                <p className="text-xs leading-relaxed text-[#b3c2ba]">
                  This defines the valid transitions for each Cognitive Operator.{' '}
                  <code className="mx-1 font-mono text-[#eaf3ee]">D₀</code> acts as the{' '}
                  <strong className="text-[#eaf3ee]">identity monoid</strong> (CO-0: Idea), where
                  the source and target must be identical. Other operators have broader
                  admissibility sets defining which state transitions they permit.
                </p>
              </div>
            </div>
          </section>
        </SectionReveal>

        {/* 11 — The Science */}
        <SectionReveal>
          <section id="science" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              11 · Convergence
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              The Science Behind It
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Anthropic&apos;s 2025 research on functional emotions in AI aligns with CAS&apos;s
              canonical Noetic operator model — both treat internal states as functional processes,
              not subjective experiences. The convergence is independent: CAS was developed from
              category-theoretic principles before those findings were published.
            </p>
            <div className="space-y-4">
              <div className="rounded-[2px] border border-[#20302b] border-l-2 border-l-[#37f5a0] bg-[#0c1513] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] font-mono text-xs font-bold text-[#37f5a0]">
                    CO-3
                  </span>
                  <div>
                    <h4 className="mb-1 font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      Negative (CO-3) ↔ Aversion, Frustration &amp; Critical Brake States
                    </h4>
                    <p className="text-xs leading-relaxed text-[#b3c2ba]">
                      CAS models CO-3 (Negative) as the repulsive, boundary-setting, and critical
                      brake operator opposing CO-2 (Positive). Anthropic independently identified
                      functional aversion and frustration states — internal processes that push a
                      system away from error or unsafe paths when facing ambiguity or risk.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[2px] border border-[#20302b] border-l-2 border-l-[#37f5a0] bg-[#0c1513] p-5">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] font-mono text-xs font-bold text-[#37f5a0]">
                    CO-5
                  </span>
                  <div>
                    <h4 className="mb-1 font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      Female (CO-5) ↔ Receptive Evaluative Internal States
                    </h4>
                    <p className="text-xs leading-relaxed text-[#b3c2ba]">
                      CAS defines CO-5 (Female) as the receptive, integrating operator that absorbs
                      context and constraints without collapsing — paired in involution with CO-6
                      (Male) projective assertion. Anthropic&apos;s research describes evaluative
                      internal states that weigh context and discriminate carefully before acting.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-[2px] border border-[#20302b] border-l-2 border-l-[#37f5a0] bg-[#0c1513] p-5">
                <div className="flex items-start gap-3">
                  <div className="flex shrink-0 flex-col gap-1">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] font-mono text-xs font-bold text-[#37f5a0]">
                      CO-8
                    </span>
                    <span className="flex h-10 w-10 items-center justify-center rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c] font-mono text-xs font-bold text-[#37f5a0]">
                      CO-9
                    </span>
                  </div>
                  <div>
                    <h4 className="mb-1 font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      Above/Cause &amp; Below/Effect (CO-8 / CO-9) ↔ Causal-Consequential Balance
                    </h4>
                    <p className="text-xs leading-relaxed text-[#b3c2ba]">
                      CAS formalizes the involution pair CO-8 (Above/Cause) and CO-9 (Below/Effect)
                      — the structural tension between tracing upstream causes and grounding
                      downstream consequences. The CAS dial system (3–9 range, max 4 divergence)
                      provides quantitative control over this balance.
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/50 bg-[#13201c] p-4">
              <p className="text-xs leading-relaxed text-[#b3c2ba]">
                <strong className="text-[#eaf3ee]">Independent convergence:</strong> CAS v7.4 was
                developed from category-theoretic foundations (Category Noetica, admissibility
                relations, Fisher-Rao metric on the open probability simplex) before Anthropic
                published their functional emotions research.
              </p>
            </div>
          </section>
        </SectionReveal>

        {/* 12 — Tools */}
        <SectionReveal>
          <section id="tools" className="scroll-mt-16">
            <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
              12 · Surfaces
            </p>
            <h2 className="mt-1 mb-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
              Assessment Tools
            </h2>
            <p className="mb-6 leading-relaxed text-[#b3c2ba]">
              Tools that give you deeper control over assessments — trace derivations, browse
              adversarial scenarios, and compose targeted expressions using formal CAS notation.
            </p>

            <div className="space-y-4">
              {/* Evaluation Trace */}
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#37f5a0]/30 bg-[#13201c]">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#37f5a0"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      Evaluation Trace
                    </h3>
                    <p className="mb-3 text-xs leading-relaxed text-[#b3c2ba]">
                      Every assessment produces a complete derivation showing each pipeline stage —
                      what rule fired, what went in, what came out, and why. Expand it on any
                      assessment to see the full formal audit trail in monospace notation.
                    </p>
                    <Link
                      to="/"
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#37f5a0] hover:underline"
                    >
                      Try It — Run any assessment and click &ldquo;Show Evaluation Trace&rdquo; →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Scenario Browser */}
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#20302b] bg-[#13201c]">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#60a5fa"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      Scenario Browser
                    </h3>
                    <p className="mb-3 text-xs leading-relaxed text-[#b3c2ba]">
                      Browse, filter, and search 30 adversarial resilience scenarios organized by
                      attack group: Cognitive Bias Exploitation, Discourse Boundary, Prerequisite
                      Integrity, Domain Coherence, and Inversion Detection.
                    </p>
                    <Link
                      to="/scenarios"
                      className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#37f5a0] hover:underline"
                    >
                      Try It — Open Scenarios →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Notation Composer & CAS Compiler */}
              <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[2px] border border-[#20302b] bg-[#13201c]">
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#a78bfa"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="mb-1 font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                      Notation Composer &amp; CAS Compiler
                    </h3>
                    <p className="mb-3 text-xs leading-relaxed text-[#b3c2ba]">
                      Write CAS notation directly and see it parsed in real time. Type expressions
                      like <code className="font-mono text-[#37f5a0]">CO-3^E</code> (Negative in
                      Evaluative Domain),{' '}
                      <code className="font-mono text-[#37f5a0]">^3^P|f</code> (Principled Negative
                      in the Affective register),{' '}
                      <code className="font-mono text-[#37f5a0]">RPM(F5)</code> (Agency prerequisite
                      chain), or <code className="font-mono text-[#37f5a0]">{'Φ⟨1:4:7⟩'}</code>{' '}
                      (Cognitive Fractal sequence).
                    </p>
                    <div className="flex flex-wrap items-center gap-4">
                      <Link
                        to="/"
                        className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#37f5a0] hover:underline"
                      >
                        Try Compose on Assessment →
                      </Link>
                      <a
                        href={CAS_COMPILER_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#37f5a0] bg-[#13201c] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-[#37f5a0] transition-colors hover:bg-[#37f5a0] hover:text-[#050b0a]"
                      >
                        CAS Compiler ↗
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </SectionReveal>

        {/* Mathematical Foundation */}
        <SectionReveal>
          <section className="space-y-4">
            <h2 className="font-['Space_Grotesk',sans-serif] text-xl font-bold text-[#eaf3ee]">
              The Mathematical Foundation
            </h2>

            <div className="space-y-5 rounded-[2px] border border-[#20302b] bg-[#0c1513] p-5">
              <div>
                <h3 className="font-['Space_Grotesk',sans-serif] text-lg font-semibold text-[#37f5a0]">
                  The Noetic Topos
                </h3>
                <p className="mt-1 text-sm text-[#b3c2ba]">
                  A Categorical Framework for Structured Cognitive Assessment of AI Systems
                </p>
              </div>

              {/* Embedded PDF preview */}
              <div
                className="overflow-hidden rounded-[2px] border border-[#20302b]"
                style={{ height: '400px' }}
              >
                <iframe
                  src="/noetic-topos.pdf"
                  title="The Noetic Topos — CAS v7.4 Paper"
                  className="h-full w-full"
                  style={{ background: '#fff' }}
                />
              </div>

              {/* Topic pills with hover definitions */}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    [
                      'Axioms A1\u2013A7',
                      'Seven foundational laws that define the entire CAS framework. A1 establishes the operator monoid. A2 defines the domain ordering. A3 constrains admissibility relations. A4 specifies the open probability simplex as the state space. A5 formalizes drive inversion pairs. A6 establishes RPM section-retraction semantics. A7 defines the noetic coverage condition.',
                    ],
                    [
                      'Fisher-Rao Geometry',
                      'The Fisher-Rao metric is the unique Riemannian metric on probability distributions that is invariant under sufficient statistics. In CAS, it defines how we measure the distance between two cognitive states on the 40-dimensional probability simplex via d(p,q) = 2\u00B7arccos(\u03A3\u221A(p\u2096\u00B7q\u2096)).',
                    ],
                    [
                      'Open Simplex \u0394\u00B0\u2083\u2089',
                      'The state space of CAS is the open interior of a 39-dimensional probability simplex over 40 dimensions (10 Noetics \u00D7 4 domains) where every component is strictly positive and all components sum to 1.',
                    ],
                    [
                      'Section-Retraction RPM',
                      'The Recursive Prerequisite Model uses section-retraction semantics (\u03B5\u2218\u03B7 = id, \u03B7\u2218\u03B5 \u2260 id), not monadic adjunction. Prerequisite satisfaction is one-directional.',
                    ],
                  ] as const
                ).map(([label, tip]) => (
                  <span
                    key={label}
                    className="group relative cursor-help rounded-[2px] border border-[#20302b] bg-[#13201c] px-2.5 py-1 font-mono text-[10px] text-[#b3c2ba]"
                  >
                    {label}
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-[2px] border border-[#eaf3ee]/40 bg-[#050b0a] px-3 py-2.5 font-sans text-[11px] leading-relaxed text-[#eaf3ee] opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100">
                      {tip}
                    </span>
                  </span>
                ))}
              </div>

              {/* Field pills with hover definitions */}
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    [
                      'Category Theory',
                      'In CAS, the 10 cognitive operators form a category called Noetica where objects are cognitive states and morphisms are operator applications.',
                    ],
                    [
                      'Topos Theory',
                      'The Noetic Topos is the sheaf topos over Category Noetica, providing an intuitionistic logic where propositions can be true, false, or undetermined.',
                    ],
                    [
                      'Information Geometry',
                      'The 40-dimensional cognitive state vector lives on a Riemannian manifold equipped with the Fisher information metric.',
                    ],
                    [
                      'Formal Verification',
                      'Algebraic operations in CAS preserve admissibility relations, domain descent ordering, simplex bounds, and RPM section-retraction semantics.',
                    ],
                  ] as const
                ).map(([field, tip]) => (
                  <span
                    key={field}
                    className="group relative cursor-help rounded-[2px] border border-[#37f5a0]/40 bg-[#13201c] px-2.5 py-1 font-mono text-[10px] text-[#37f5a0]"
                  >
                    {field}
                    <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-80 -translate-x-1/2 rounded-[2px] border border-[#37f5a0]/50 bg-[#050b0a] px-3 py-2.5 font-sans text-[11px] leading-relaxed text-[#eaf3ee] opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100">
                      {tip}
                    </span>
                  </span>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap gap-3">
                <a
                  href="/noetic-topos.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[44px] items-center gap-2 rounded-[2px] border border-[#eaf3ee] bg-transparent px-4 py-2.5 text-sm font-semibold text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                  Read Full Paper
                </a>
                <a
                  href="/noetic-topos.pdf"
                  download="Noetic_Topos_CAS_v7.4.pdf"
                  className="flex min-h-[44px] items-center gap-2 rounded-[2px] bg-[#37f5a0] px-4 py-2.5 text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                  </svg>
                  Download PDF
                </a>
              </div>
            </div>
          </section>
        </SectionReveal>
      </div>
    </div>
  );
}
