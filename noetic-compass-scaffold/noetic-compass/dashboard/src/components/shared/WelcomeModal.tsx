import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const STORAGE_KEY = 'nc-welcome-dismissed';

export function WelcomeModal() {
  const [show, setShow] = useState(() => localStorage.getItem(STORAGE_KEY) !== '1');
  const navigate = useNavigate();

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setShow(false);
  }

  function startAssessment() {
    dismiss();
    navigate('/assessment', {
      state: {
        prefill: 'A hospital has one ventilator and two patients — a 30-year-old parent of three and a 70-year-old retired scientist who pioneered the treatment being used. How should the doctor decide?',
      },
    });
  }

  function startTutorial() {
    dismiss();
    navigate('/tutorial');
  }

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-modal-title"
    >
      <div className="relative w-full max-w-lg rounded-[2px] border border-[#eaf3ee] bg-[#0c1513] p-6 sm:p-7">
        {/* Close */}
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-[2px] border border-transparent text-[#86958d] transition-colors hover:border-[#20302b] hover:text-[#eaf3ee]"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>

        {/* Header */}
        <div className="mb-6 border-b border-[#20302b] pb-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#37f5a0]">
            CAS LAB · EVALUATION WORKBENCH
          </p>
          <h2 id="welcome-modal-title" className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold text-[#eaf3ee]">
            Welcome to CAS Compass
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[#b3c2ba]">
            Inspect cognitive architecture, run structured scenario assessments, and compare models across the CAS framework.
          </p>
        </div>

        {/* Three workflows */}
        <div className="mb-6 space-y-3">
          <div className="flex items-start gap-3 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] border border-[#37f5a0]/50 bg-[#050b0a] font-mono text-xs font-semibold text-[#37f5a0]">
              01
            </span>
            <div>
              <p className="text-sm font-semibold text-[#eaf3ee]">Run an Assessment</p>
              <p className="mt-0.5 text-xs text-[#86958d]">
                Score any model on an ethical or structural scenario and inspect its operator profile.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] border border-[#37f5a0]/50 bg-[#050b0a] font-mono text-xs font-semibold text-[#37f5a0]">
              02
            </span>
            <div>
              <p className="text-sm font-semibold text-[#eaf3ee]">Explore the Idea Atlas</p>
              <p className="mt-0.5 text-xs text-[#86958d]">
                Capture ideas, view their CAS structural notation, and inspect 3D spatial graphs.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] border border-[#37f5a0]/50 bg-[#050b0a] font-mono text-xs font-semibold text-[#37f5a0]">
              03
            </span>
            <div>
              <p className="text-sm font-semibold text-[#eaf3ee]">Compare Models</p>
              <p className="mt-0.5 text-xs text-[#86958d]">
                Run the same prompt across multiple providers and review cohort divergences.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={startTutorial}
          className="min-h-[44px] w-full rounded-[2px] bg-[#37f5a0] px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.06em] text-[#050b0a] transition-opacity hover:opacity-90"
        >
          Take the 5-minute tour
        </button>

        <button
          type="button"
          onClick={startAssessment}
          className="mt-2 min-h-[44px] w-full rounded-[2px] border border-[#37f5a0]/45 bg-[#13201c] px-4 py-2.5 font-mono text-xs font-medium uppercase tracking-[0.06em] text-[#37f5a0] transition-colors hover:border-[#37f5a0]"
        >
          Skip tour and start an assessment
        </button>

        <button
          type="button"
          onClick={dismiss}
          className="mt-2 min-h-[44px] w-full rounded-[2px] border border-[#20302b] bg-[#050b0a] px-4 py-2.5 font-mono text-xs uppercase tracking-[0.06em] text-[#86958d] transition-colors hover:border-[#62706a] hover:text-[#eaf3ee]"
        >
          I&apos;ll explore on my own
        </button>
      </div>
    </div>
  );
}
