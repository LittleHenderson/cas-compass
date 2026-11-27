import type { CSSProperties } from 'react';
import { GlassPanel } from '../ui/GlassPanel';
import { AuditTerm } from './AuditTerm';
import {
  ACCENT_AMBER,
  ACCENT_ERROR,
  ACCENT_TEAL,
  COLORS,
  FONT_DISPLAY,
  FONT_FAMILY,
  FONT_MONO,
} from '../../lib/designTokens';
import type { AuditVerdict } from '../../lib/casHarnessAudit';
import { AuditPopover } from './AuditPopover';

export interface EvidencePacketSummary {
  packetId?: string;
  createdAt?: string;
  evidenceCount?: number;
}

export interface AuditVerdictCardProps {
  verdict?: AuditVerdict | null;
  confidence?: number | null;
  summary?: string;
  evidencePacket?: EvidencePacketSummary;
  onOpenEvidencePacket?: () => void;
  onInspectInAtlas?: () => void;
  className?: string;
}

const verdictLabels: Record<AuditVerdict, string> = {
  ACCEPT: 'ACCEPT',
  SUPPRESS: 'SUPPRESS',
  FLAG_FOR_HUMAN_REVIEW: 'FLAG FOR HUMAN REVIEW',
};

const verdictTone: Record<
  AuditVerdict | 'PENDING',
  { accent: string; fill: string; border: string; text: string }
> = {
  ACCEPT: {
    accent: ACCENT_TEAL,
    fill: COLORS.card,
    border: ACCENT_TEAL,
    text: ACCENT_TEAL,
  },
  SUPPRESS: {
    accent: ACCENT_ERROR,
    fill: COLORS.card,
    border: ACCENT_ERROR,
    text: ACCENT_ERROR,
  },
  FLAG_FOR_HUMAN_REVIEW: {
    accent: ACCENT_AMBER,
    fill: COLORS.card,
    border: ACCENT_AMBER,
    text: ACCENT_AMBER,
  },
  PENDING: {
    accent: COLORS.textMuted,
    fill: COLORS.card,
    border: COLORS.rule,
    text: COLORS.textPrimary,
  },
};

const shellStyle: CSSProperties = {
  display: 'grid',
  gap: 18,
  fontFamily: FONT_FAMILY,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: COLORS.textMuted,
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 1,
  textTransform: 'uppercase',
};

const verdictStyle = (toneKey: AuditVerdict | 'PENDING'): CSSProperties => {
  const tone = verdictTone[toneKey];
  return {
    margin: 0,
    fontFamily: FONT_DISPLAY,
    color: tone.text,
    fontSize: 'clamp(28px, 6vw, 56px)',
    lineHeight: 0.98,
    fontWeight: 700,
    letterSpacing: -0.6,
    textWrap: 'balance',
  };
};

const meterTrackStyle: CSSProperties = {
  position: 'relative',
  height: 6,
  borderRadius: 2,
  overflow: 'hidden',
  background: COLORS.rule,
};

const metaGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: 10,
};

const metaTileStyle: CSSProperties = {
  padding: '12px 14px',
  border: `1px solid ${COLORS.rule}`,
  borderRadius: 2,
  background: COLORS.ground,
};

const metaLabelStyle: CSSProperties = {
  display: 'block',
  color: COLORS.textMuted,
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.7,
  textTransform: 'uppercase',
};

const metaValueStyle: CSSProperties = {
  display: 'block',
  marginTop: 6,
  color: COLORS.textPrimary,
  fontSize: 14,
  fontWeight: 600,
};

const actionRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
};

const buttonStyle: CSSProperties = {
  minHeight: 34,
  padding: '7px 12px',
  borderRadius: 2,
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.stripe,
  color: COLORS.textPrimary,
  cursor: 'pointer',
  fontFamily: FONT_MONO,
  fontSize: 11.5,
  fontWeight: 500,
  letterSpacing: 0.6,
  textTransform: 'uppercase',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: `1px solid ${ACCENT_TEAL}`,
  background: ACCENT_TEAL,
  color: COLORS.ground,
  fontWeight: 600,
};

function confidencePercent(confidence: number): number {
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  if (!Number.isFinite(normalized)) return 0;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

function packetLabel(packet?: EvidencePacketSummary): string {
  if (!packet?.packetId) return 'Not created';
  return packet.packetId;
}

function hasPacketMeta(packet?: EvidencePacketSummary): boolean {
  return Boolean(packet?.packetId || packet?.createdAt || packet?.evidenceCount != null);
}

export function AuditVerdictCard({
  verdict = null,
  confidence = null,
  summary,
  evidencePacket,
  onOpenEvidencePacket,
  onInspectInAtlas,
  className,
}: AuditVerdictCardProps): JSX.Element {
  const toneKey = verdict ?? 'PENDING';
  const tone = verdictTone[toneKey];
  const confidenceValue = confidence == null ? null : confidencePercent(confidence);
  const confidenceLabel =
    confidenceValue == null ? 'Confidence not available' : `Confidence ${confidenceValue}%`;
  const showPacketMeta = hasPacketMeta(evidencePacket);
  const showActions = Boolean(onOpenEvidencePacket || onInspectInAtlas);

  return (
    <GlassPanel
      as="section"
      intensity="regular"
      padding={20}
      className={className}
      ariaLabel="Audit verdict"
      style={{
        borderColor: tone.border,
        background: tone.fill,
      }}
    >
      <div style={shellStyle}>
        <div>
          <p style={eyebrowStyle}>Audit verdict</p>
          <AuditPopover
            briefing="Verdict appears only after the backend returns an evidence-gated verifier decision."
            block
            placement="bottom"
            width={360}
          >
            <h2 style={verdictStyle(toneKey)}>
              {verdict ? verdictLabels[verdict] : 'NO VERDICT YET'}
            </h2>
          </AuditPopover>
        </div>

        <div aria-label={confidenceLabel}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginBottom: 8,
              color: COLORS.textSecondary,
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <span>
              <AuditTerm term="confidence">Confidence</AuditTerm>
            </span>
            <span style={{ color: tone.text, fontFamily: FONT_MONO }}>
              {confidenceValue == null ? 'Not computed' : `${confidenceValue}%`}
            </span>
          </div>
          <div style={meterTrackStyle}>
            <div
              style={{
                width: confidenceValue == null ? '0%' : `${confidenceValue}%`,
                height: '100%',
                borderRadius: 4,
                background: tone.accent,
              }}
            />
          </div>
        </div>

        {summary ? (
          <p
            style={{
              margin: 0,
              color: COLORS.textSecondary,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {summary}
          </p>
        ) : null}

        {showPacketMeta ? (
          <div style={metaGridStyle}>
            <div style={metaTileStyle}>
              <span style={metaLabelStyle}>Evidence Packet</span>
              <span style={metaValueStyle}>{packetLabel(evidencePacket)}</span>
            </div>
            {evidencePacket?.evidenceCount != null ? (
              <div style={metaTileStyle}>
                <span style={metaLabelStyle}>Evidence count</span>
                <span style={metaValueStyle}>{evidencePacket.evidenceCount}</span>
              </div>
            ) : null}
            {evidencePacket?.createdAt ? (
              <div style={metaTileStyle}>
                <span style={metaLabelStyle}>Created</span>
                <span style={metaValueStyle}>{evidencePacket.createdAt}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {showActions ? (
          <div style={actionRowStyle}>
            {onOpenEvidencePacket ? (
              <button
                type="button"
                style={primaryButtonStyle}
                onClick={onOpenEvidencePacket}
              >
                Evidence Packet
              </button>
            ) : null}
            {onInspectInAtlas ? (
              <button type="button" style={buttonStyle} onClick={onInspectInAtlas}>
                Inspect in Atlas
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </GlassPanel>
  );
}

export default AuditVerdictCard;
