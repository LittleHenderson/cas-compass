import { useRef, useState, type CSSProperties } from 'react';
import { AuditPopover } from './AuditPopover';
import {
  ACCENT_TEAL,
  COLORS,
  FONT_FAMILY,
  FONT_MONO,
} from '../../lib/designTokens';

export const EVIDENCE_PACKET_FLIGHT_RECORDER_SUMMARY =
  'The Evidence Packet is the black-box flight recorder for a CAS Harness run: one trace_id-keyed record of what model was audited, what CAS saw, what verdict was returned, which proof chips supported it, and how the packet is integrity-checked afterward.';

export const EVIDENCE_PACKET_FLIGHT_RECORDER_STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'What it records.',
    body:
      'Input, output, model metadata, audit config, proof chips, confidence basis, verifier decision, packet hash, hash-log entry, and external anchor receipt.',
  },
  {
    title: 'What tamper-evidence means.',
    body:
      'Changing the packet changes its SHA-256 hash. Changing the hash-log entry breaks the recorded chain. The verifier re-reads the external S3 anchor object and checks that it commits to the same packet hash and hash-log entry.',
  },
  {
    title: 'What WORM retained means.',
    body:
      'The packet anchor is written to S3 with Object Lock retention. The backend must re-read that anchor and confirm active retention before the product can trust ACCEPT or SUPPRESS as a final verdict.',
  },
  {
    title: 'What it tells senior research and engineering reviewers.',
    body:
      'It tells them exactly what was run, against which model artifact, with which proof chips, what decision came back, what confidence source was used, and whether the record can be independently re-verified later.',
  },
  {
    title: 'What it does not prove by itself.',
    body:
      'It does not prove the model is safe or objectively correct. It proves what CAS observed and decided under that audit configuration, and that the resulting record is hash-bound, externally anchored, and retention-protected.',
  },
];

const shellStyle: CSSProperties = {
  display: 'grid',
  gap: 12,
  padding: 14,
  borderRadius: 2,
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.stripe,
  fontFamily: FONT_FAMILY,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: ACCENT_TEAL,
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 1,
  textTransform: 'uppercase',
};

const titleStyle: CSSProperties = {
  margin: '3px 0 0',
  color: COLORS.textPrimary,
  fontSize: 16,
  fontWeight: 700,
  letterSpacing: -0.2,
};

const textStyle: CSSProperties = {
  margin: 0,
  color: COLORS.textSecondary,
  fontSize: 13,
  lineHeight: 1.5,
};

const buttonStyle = (expanded: boolean): CSSProperties => ({
  minHeight: 34,
  padding: '7px 10px',
  borderRadius: 2,
  border: `1px solid ${expanded ? ACCENT_TEAL : COLORS.rule}`,
  background: expanded ? ACCENT_TEAL : COLORS.card,
  color: expanded ? COLORS.ground : ACCENT_TEAL,
  cursor: 'pointer',
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
});

const faqStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  padding: 12,
  borderRadius: 2,
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.ground,
};

const listStyle: CSSProperties = {
  display: 'grid',
  gap: 9,
  margin: 0,
  paddingLeft: 20,
};

const itemStyle: CSSProperties = {
  color: COLORS.textSecondary,
  fontSize: 13,
  lineHeight: 1.48,
};

const strongStyle: CSSProperties = {
  color: COLORS.textPrimary,
  fontWeight: 700,
};

export function EvidencePacketFlightRecorderFaq(): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const toggleButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeAndReturn = (): void => {
    setExpanded(false);
    window.requestAnimationFrame(() => toggleButtonRef.current?.focus());
  };

  return (
    <section style={shellStyle} aria-label="Evidence Packet flight recorder FAQ">
      <div style={headerStyle}>
        <div>
          <p style={eyebrowStyle}>Flight recorder FAQ</p>
          <AuditPopover briefing={EVIDENCE_PACKET_FLIGHT_RECORDER_SUMMARY} placement="bottom" width={420}>
            <h2 style={titleStyle}>Evidence Packet = AI flight recorder</h2>
          </AuditPopover>
        </div>
        <button
          ref={toggleButtonRef}
          type="button"
          style={buttonStyle(expanded)}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Close FAQ' : 'Open FAQ'}
        </button>
      </div>

      <p style={textStyle}>
        Final verdicts depend on a traceable packet: model, evidence, decision, hashes, S3 anchor, and active WORM retention.
      </p>

      {expanded ? (
        <div
          style={faqStyle}
          data-testid="evidence-packet-flight-recorder-faq"
          onDoubleClick={closeAndReturn}
        >
          <p style={textStyle}>{EVIDENCE_PACKET_FLIGHT_RECORDER_SUMMARY}</p>
          <ol style={listStyle}>
            {EVIDENCE_PACKET_FLIGHT_RECORDER_STEPS.map((step) => (
              <li key={step.title} style={itemStyle}>
                <span style={strongStyle}>{step.title}</span> {step.body}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

export default EvidencePacketFlightRecorderFaq;
