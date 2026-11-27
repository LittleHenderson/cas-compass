import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../components/shared/Card';

const TUTORIAL_STORAGE_KEY = 'nc_tutorial_complete_v1';
const CAS_COMPILER_URL = 'https://www.caslabai.com/compiler/';

type DetailMode = 'simple' | 'technical';

interface TutorialStep {
  eyebrow: string;
  title: string;
  plain: string;
  technical: string;
  actionLabel: string;
  actionTo: string;
  external?: boolean;
}

const STEPS: readonly TutorialStep[] = [
  {
    eyebrow: '1 / 5',
    title: 'CAS looks for structure, not vibes.',
    plain: 'CAS Compass turns a prompt, response, or profile into a structured map you can inspect.',
    technical:
      'CAS Compass organizes cognition across the 10 Noetics, 4 Domains, 4 Registers (|T Transcendent, |A Analytical, |f Affective, |E Embodied), 7 Drives, lacunarity, and compiler-validated notation.',
    actionLabel: 'See the framework',
    actionTo: '/how-it-works',
  },
  {
    eyebrow: '2 / 5',
    title: 'First, look at the shape.',
    plain: 'The Radial Architecture Display is the visual map. Brightness, position, and gaps show where a profile is active or missing structure.',
    technical: 'The display renders Noetic by Domain activations, Register modulation, Drive markers, and explicit lacunarity voids.',
    actionLabel: 'Open visual and audio demo',
    actionTo: '/visualization',
  },
  {
    eyebrow: '3 / 5',
    title: 'Then, listen for the pattern.',
    plain: 'The Temporal Cognitive Score turns the same structure into synthesized sound. Silence is meaningful when it marks a gap.',
    technical: 'Noetics map to pitch, Registers to expression, Drives to tempo, Domains to staves, and lacunarity to rests. Audio is click-to-play only.',
    actionLabel: 'Hear the score',
    actionTo: '/visualization',
  },
  {
    eyebrow: '4 / 5',
    title: 'Use forecasts as test priorities.',
    plain: 'Risk Forecast does not claim to read minds. It shows where the structure may fail so you know what to test next.',
    technical: 'Predictive Lacunarity Risk ranks structural gaps across Noetic, Domain, Drive, RPM, and involution signals.',
    actionLabel: 'Run a risk check',
    actionTo: '/forecast',
  },
  {
    eyebrow: '5 / 5',
    title: 'Open the compiler when you want the formal layer.',
    plain: 'You can stay in plain language, but the external CAS Compiler is there when you want exact CAS notation.',
    technical: 'The compiler parses CAS expressions, typed set-theory meta-logic, Rule 4 admissibility, and register-aware operators.',
    actionLabel: 'CAS Compiler ↗',
    actionTo: CAS_COMPILER_URL,
    external: true,
  },
] as const;

function setTutorialComplete() {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, '1');
}

export function TutorialPage() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [detailMode, setDetailMode] = useState<DetailMode>('simple');
  const [completed, setCompleted] = useState(
    () => localStorage.getItem(TUTORIAL_STORAGE_KEY) === '1',
  );
  const activeStep = STEPS[activeIndex];
  const progress = ((activeIndex + 1) / STEPS.length) * 100;

  function markComplete() {
    setTutorialComplete();
    setCompleted(true);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-16">
      <div className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6">
        <div className="max-w-3xl">
          <p className="mb-3 inline-flex rounded-[2px] border border-[#37f5a0]/40 bg-[#13201c] px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#37f5a0]">
            Start Here · CAS Lab
          </p>
          <h1 className="font-['Space_Grotesk',sans-serif] text-3xl font-bold tracking-tight text-[#eaf3ee] sm:text-4xl">
            Learn CAS Compass without starting in the math.
          </h1>
          <p className="mt-3 text-sm leading-7 text-[#b3c2ba]">
            This five-step tour explains what to look at, what to listen for, and when to use the technical tools.
          </p>
        </div>
      </div>

      <Card>
        <div className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#37f5a0]">
              Guided path
            </p>
            <p className="mt-1 text-sm text-[#86958d]">
              {completed ? 'Completed once. You can replay it anytime.' : 'About five minutes. No prior CAS knowledge needed.'}
            </p>
          </div>
          <div className="inline-flex rounded-[2px] border border-[#20302b] bg-[#050b0a] p-1">
            {(['simple', 'technical'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setDetailMode(mode)}
                className={`rounded-[2px] px-3 py-1.5 font-mono text-xs font-semibold uppercase tracking-[0.1em] transition-colors ${
                  detailMode === mode
                    ? 'bg-[#37f5a0] text-[#050b0a]'
                    : 'text-[#86958d] hover:text-[#eaf3ee]'
                }`}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-6 h-1.5 overflow-hidden rounded-[2px] bg-[#13201c]" aria-label="Tutorial progress">
          <div
            className="h-full bg-[#37f5a0] transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="grid gap-5 lg:grid-cols-[0.75fr_1.25fr]">
          <nav className="grid gap-2" aria-label="Tutorial steps">
            {STEPS.map((step, index) => (
              <button
                key={step.title}
                type="button"
                onClick={() => setActiveIndex(index)}
                className={`rounded-[2px] border p-4 text-left transition-colors ${
                  index === activeIndex
                    ? 'border-[#37f5a0] bg-[#13201c]'
                    : 'border-[#20302b] bg-[#0c1513] hover:border-[#eaf3ee]/50'
                }`}
              >
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#37f5a0]">
                  {step.eyebrow}
                </span>
                <span className="mt-1 block font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                  {step.title}
                </span>
              </button>
            ))}
          </nav>

          <section className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f59e0b]">
              {activeStep.eyebrow}
            </p>
            <h2 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold tracking-tight text-[#eaf3ee]">
              {activeStep.title}
            </h2>
            <p className="mt-4 text-base leading-8 text-[#b3c2ba]">
              {detailMode === 'simple' ? activeStep.plain : activeStep.technical}
            </p>

            <div className="mt-6 rounded-[2px] border border-dashed border-[#f59e0b]/50 bg-[#0c1513] p-4">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-[#f59e0b]">
                Plain-language rule
              </p>
              <p className="mt-2 text-sm leading-7 text-[#b3c2ba]">
                If a result sounds like a claim, treat it as something to test. CAS is strongest when it turns uncertainty into a concrete check.
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setActiveIndex((value) => Math.max(0, value - 1))}
                  disabled={activeIndex === 0}
                  className="rounded-[2px] border border-[#eaf3ee] bg-transparent px-4 py-2 text-sm font-semibold text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setActiveIndex((value) => Math.min(STEPS.length - 1, value + 1))}
                  disabled={activeIndex === STEPS.length - 1}
                  className="rounded-[2px] border border-[#37f5a0] bg-[#0c1513] px-4 py-2 text-sm font-semibold text-[#37f5a0] transition-colors hover:bg-[#37f5a0] hover:text-[#050b0a] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
              {activeStep.external ? (
                <a
                  href={activeStep.actionTo}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-[2px] bg-[#37f5a0] px-4 py-2 text-center text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90"
                >
                  {activeStep.actionLabel}
                </a>
              ) : (
                <Link
                  to={activeStep.actionTo}
                  className="rounded-[2px] bg-[#37f5a0] px-4 py-2 text-center text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90"
                >
                  {activeStep.actionLabel}
                </Link>
              )}
            </div>
          </section>
        </div>
      </Card>

      <Card title="Where to go after the tour">
        <div className="grid gap-3 md:grid-cols-4">
          {[
            { label: 'Visual + Audio', to: '/visualization', body: 'See and hear one profile.', external: false },
            { label: 'Risk Forecast', to: '/forecast', body: 'Find test priorities.', external: false },
            { label: 'CAS Compiler ↗', to: CAS_COMPILER_URL, body: 'Inspect formal notation on CAS Lab.', external: true },
            { label: 'Assessment', to: '/assessment', body: 'Score a response pattern.', external: false },
          ].map((dest) =>
            dest.external ? (
              <a
                key={dest.to}
                href={dest.to}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4 transition-colors hover:border-[#37f5a0]"
              >
                <p className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                  {dest.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#86958d]">{dest.body}</p>
              </a>
            ) : (
              <Link
                key={dest.to}
                to={dest.to}
                className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-4 transition-colors hover:border-[#37f5a0]"
              >
                <p className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">
                  {dest.label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-[#86958d]">{dest.body}</p>
              </Link>
            ),
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={markComplete}
          className="rounded-[2px] border border-[#eaf3ee] bg-[#0c1513] px-4 py-2 font-mono text-xs font-semibold uppercase tracking-[0.12em] text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
        >
          {completed ? 'Tutorial marked complete' : 'Mark tutorial complete'}
        </button>
      </div>
    </div>
  );
}

export default TutorialPage;
