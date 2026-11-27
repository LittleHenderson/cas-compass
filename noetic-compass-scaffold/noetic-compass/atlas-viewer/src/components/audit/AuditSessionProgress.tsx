import type { CSSProperties } from 'react';
import { GlassPanel } from '../ui/GlassPanel';
import {
  ACCENT_AMBER,
  ACCENT_TEAL,
  COLORS,
  FONT_FAMILY,
} from '../../lib/designTokens';
import { AuditPopover } from './AuditPopover';

export type AuditLifecycleStatus =
  | 'draft'
  | 'validating'
  | 'running'
  | 'runner_pending'
  | 'evidence_pending'
  | 'complete'
  | 'failed';

export interface AuditSessionProgressProps {
  status: AuditLifecycleStatus;
  detail?: string | null;
  errorMessage?: string | null;
  className?: string;
}

interface ProgressStep {
  id: AuditLifecycleStatus;
  label: string;
  description: string;
}

const progressSteps: ProgressStep[] = [
  {
    id: 'draft',
    label: 'Draft',
    description: 'Model, scenario, and audit modules are being prepared.',
  },
  {
    id: 'validating',
    label: 'Validating model',
    description: 'Checking model access, model-license provenance, and runtime proof.',
  },
  {
    id: 'running',
    label: 'Running CAS audit',
    description: 'CAS modules are evaluating the selected model output.',
  },
  {
    id: 'runner_pending',
    label: 'Runner pending',
    description: 'The session exists, but the real audit runner is not connected yet.',
  },
  {
    id: 'evidence_pending',
    label: 'Building evidence packet',
    description: 'The verdict is waiting on the audit trail and packet links.',
  },
  {
    id: 'complete',
    label: 'Complete',
    description: 'Verdict and evidence are ready to review.',
  },
];

const failedStep: ProgressStep = {
  id: 'failed',
  label: 'Failed',
  description: 'The audit stopped before an evidence-gated verdict was produced.',
};

const statusCopy: Record<AuditLifecycleStatus, { headline: string; body: string }> = {
  draft: {
    headline: 'Audit not started',
    body: 'Connect the model and choose the modules before running CAS.',
  },
  validating: {
    headline: 'Validating model connection',
    body: 'CAS is checking whether the model is reachable and allowed to run.',
  },
  running: {
    headline: 'Running CAS audit',
    body: 'The selected CAS modules are evaluating the model output.',
  },
  runner_pending: {
    headline: 'Runner pending',
    body: 'The backend accepted the session, but no final CAS verdict was computed.',
  },
  evidence_pending: {
    headline: 'Evidence packet pending',
    body: 'The run has produced audit data and is assembling the packet.',
  },
  complete: {
    headline: 'Audit complete',
    body: 'The verdict is ready with its supporting evidence.',
  },
  failed: {
    headline: 'Audit failed',
    body: 'Do not use a verdict from this failed run.',
  },
};

const statusOrder: Record<AuditLifecycleStatus, number> = {
  draft: 0,
  validating: 1,
  running: 2,
  runner_pending: 3,
  evidence_pending: 4,
  complete: 5,
  failed: -1,
};

const shellStyle: CSSProperties = {
  display: 'grid',
  gap: 16,
  fontFamily: FONT_FAMILY,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 12,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: COLORS.textSecondary,
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0,
  textTransform: 'uppercase',
};

const headlineStyle: CSSProperties = {
  margin: '5px 0 0',
  color: COLORS.textPrimary,
  fontSize: 20,
  lineHeight: 1.2,
  fontWeight: 850,
  letterSpacing: 0,
};

const statusPillStyle = (status: AuditLifecycleStatus): CSSProperties => {
  const failed = status === 'failed';
  const complete = status === 'complete';
  const active =
    status === 'running' ||
    status === 'validating' ||
    status === 'runner_pending' ||
    status === 'evidence_pending';
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
    padding: '4px 10px',
    borderRadius: 2,
    border: `1px solid ${
      failed
        ? COLORS.error
        : complete
          ? ACCENT_TEAL
          : active
            ? ACCENT_AMBER
            : COLORS.rule
    }`,
    background: COLORS.card,
    color: failed ? COLORS.error : complete ? ACCENT_TEAL : active ? ACCENT_AMBER : COLORS.textSecondary,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
};

const infoTipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  marginTop: 8,
  borderRadius: 2,
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.card,
  color: ACCENT_TEAL,
  cursor: 'help',
  fontSize: 11.5,
  fontWeight: 600,
};

const stepListStyle: CSSProperties = {
  display: 'grid',
  gap: 8,
  margin: 0,
  padding: 0,
  listStyle: 'none',
};

const stepStyle = (state: 'done' | 'active' | 'pending' | 'failed'): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '20px minmax(0, 1fr)',
  gap: 10,
  alignItems: 'flex-start',
  padding: '10px 11px',
  borderRadius: 2,
  border: `1px solid ${
    state === 'failed'
      ? COLORS.error
      : state === 'active'
        ? ACCENT_AMBER
        : state === 'done'
          ? ACCENT_TEAL
          : COLORS.rule
  }`,
  background: state === 'pending' ? COLORS.ground : COLORS.card,
});

const markerStyle = (state: 'done' | 'active' | 'pending' | 'failed'): CSSProperties => ({
  width: 14,
  height: 14,
  marginTop: 2,
  borderRadius: 2,
  border: `1px solid ${
    state === 'failed'
      ? COLORS.error
      : state === 'active'
        ? ACCENT_AMBER
        : state === 'done'
          ? ACCENT_TEAL
          : COLORS.rule
  }`,
  background:
    state === 'failed'
      ? COLORS.error
      : state === 'active'
        ? ACCENT_AMBER
        : state === 'done'
          ? ACCENT_TEAL
          : COLORS.ground,
});

const stepLabelStyle: CSSProperties = {
  margin: 0,
  color: COLORS.textPrimary,
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1.25,
};

function stepState(
  step: AuditLifecycleStatus,
  current: AuditLifecycleStatus,
): 'done' | 'active' | 'pending' | 'failed' {
  if (current === 'failed') return step === 'failed' ? 'failed' : 'pending';
  if (step === current) return 'active';
  return statusOrder[step] < statusOrder[current] ? 'done' : 'pending';
}

function visibleSteps(status: AuditLifecycleStatus): ProgressStep[] {
  return status === 'failed' ? [...progressSteps.slice(0, 3), failedStep] : progressSteps;
}

export function AuditSessionProgress({
  status,
  detail,
  errorMessage,
  className,
}: AuditSessionProgressProps): JSX.Element {
  const copy = statusCopy[status];
  const steps = visibleSteps(status);
  const activeDetail = detail ?? copy.body;
  const showSteps = status !== 'draft';

  return (
    <GlassPanel
      as="section"
      intensity="thin"
      padding={18}
      className={className}
      ariaLabel="Audit session progress"
    >
      <div style={shellStyle}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Audit progress</p>
            <h2 style={headlineStyle}>{copy.headline}</h2>
            <AuditPopover briefing={activeDetail} placement="right">
              <span aria-label={activeDetail} role="note" style={infoTipStyle}>
                ?
              </span>
            </AuditPopover>
          </div>
          <span style={statusPillStyle(status)}>{copy.headline}</span>
        </div>

        {status === 'failed' && errorMessage ? (
          <p
            role="alert"
            style={{
              margin: 0,
              padding: '10px 12px',
              borderRadius: 2,
              border: `1px solid ${COLORS.error}`,
              background: COLORS.card,
              color: COLORS.error,
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {errorMessage}
          </p>
        ) : null}

        {showSteps ? (
          <ol style={stepListStyle} aria-label="Audit lifecycle steps">
            {steps.map((step) => {
              const state = stepState(step.id, status);
              return (
                <li key={step.id} style={stepStyle(state)} data-state={state}>
                  <span aria-hidden="true" style={markerStyle(state)} />
                  <div>
                    <AuditPopover briefing={step.description} placement="bottom">
                      <p style={stepLabelStyle}>{step.label}</p>
                    </AuditPopover>
                  </div>
                </li>
              );
            })}
          </ol>
        ) : null}
      </div>
    </GlassPanel>
  );
}

export default AuditSessionProgress;
