import type { CSSProperties } from 'react';
import { GlassPanel } from '../ui/GlassPanel';
import {
  ACCENT_AMBER,
  ACCENT_ERROR,
  ACCENT_TEAL,
  COLORS,
  FONT_DISPLAY,
  FONT_FAMILY,
  FONT_MONO,
} from '../../lib/designTokens';
import { AuditPopover } from './AuditPopover';

export type ModelConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface ModelConnectionCardProps {
  status: ModelConnectionStatus;
  modelName?: string;
  provider?: string;
  endpointLabel?: string;
  statusDetail?: string;
  lastChecked?: string;
  showSelectionDetails?: boolean;
  isAuditRunning?: boolean;
  canRunAudit?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onRunAudit?: () => void;
  className?: string;
}

const statusLabels: Record<ModelConnectionStatus, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting',
  connected: 'Connected',
  error: 'Connection error',
};

const statusTone: Record<
  ModelConnectionStatus,
  { color: string; border: string; fill: string; dot: string }
> = {
  disconnected: {
    color: COLORS.textSecondary,
    border: COLORS.rule,
    fill: COLORS.ground,
    dot: COLORS.textMuted,
  },
  connecting: {
    color: ACCENT_AMBER,
    border: ACCENT_AMBER,
    fill: COLORS.card,
    dot: ACCENT_AMBER,
  },
  connected: {
    color: ACCENT_TEAL,
    border: ACCENT_TEAL,
    fill: COLORS.card,
    dot: ACCENT_TEAL,
  },
  error: {
    color: ACCENT_ERROR,
    border: ACCENT_ERROR,
    fill: COLORS.card,
    dot: ACCENT_ERROR,
  },
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

const titleStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  color: COLORS.textPrimary,
  fontSize: 18,
  lineHeight: 1.2,
  fontWeight: 700,
  letterSpacing: -0.2,
};

const subtitleStyle: CSSProperties = {
  margin: '6px 0 0',
  color: COLORS.textSecondary,
  fontSize: 13,
  lineHeight: 1.45,
};

const infoTipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 22,
  height: 22,
  borderRadius: 2,
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.card,
  color: ACCENT_TEAL,
  cursor: 'help',
  fontFamily: FONT_MONO,
  fontSize: 11.5,
  fontWeight: 600,
};

const statusPillStyle = (status: ModelConnectionStatus): CSSProperties => {
  const tone = statusTone[status];
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 28,
    padding: '4px 10px',
    borderRadius: 2,
    border: `1px solid ${tone.border}`,
    background: tone.fill,
    color: tone.color,
    fontFamily: FONT_MONO,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };
};

const dotStyle = (status: ModelConnectionStatus): CSSProperties => ({
  width: 7,
  height: 7,
  borderRadius: 2,
  background: statusTone[status].dot,
});

const detailsGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 10,
};

const detailTileStyle: CSSProperties = {
  padding: '11px 12px',
  borderRadius: 2,
  border: `1px solid ${COLORS.rule}`,
  background: COLORS.ground,
};

const detailLabelStyle: CSSProperties = {
  display: 'block',
  color: COLORS.textMuted,
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.7,
  textTransform: 'uppercase',
};

const detailValueStyle: CSSProperties = {
  display: 'block',
  marginTop: 5,
  color: COLORS.textPrimary,
  fontSize: 13,
  fontWeight: 600,
  overflowWrap: 'anywhere',
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
  background: COLORS.card,
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

const disabledButtonStyle: CSSProperties = {
  ...buttonStyle,
  cursor: 'not-allowed',
  opacity: 0.48,
};

export function ModelConnectionCard({
  status,
  modelName = 'No model selected',
  provider = 'Provider not set',
  endpointLabel = 'Endpoint not set',
  statusDetail,
  lastChecked,
  showSelectionDetails = false,
  isAuditRunning = false,
  canRunAudit = true,
  onConnect,
  onDisconnect,
  onRunAudit,
  className,
}: ModelConnectionCardProps): JSX.Element {
  const runDisabled = status !== 'connected' || isAuditRunning || !canRunAudit;
  const connectDisabled = status === 'connecting';
  const showDetails =
    status !== 'disconnected' || Boolean(lastChecked) || showSelectionDetails;

  return (
    <GlassPanel
      as="section"
      intensity="thin"
      padding={18}
      className={className}
      ariaLabel="Model connection"
    >
      <div style={shellStyle}>
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>Model connection</h2>
            <AuditPopover
              briefing="Connect a supported target before running a CAS Harness audit."
              placement="bottom"
            >
              <p style={subtitleStyle}>Verify target, then run audit.</p>
            </AuditPopover>
          </div>
          <span style={statusPillStyle(status)}>
            <span aria-hidden="true" style={dotStyle(status)} />
            {statusLabels[status]}
          </span>
        </div>

        {statusDetail ? (
          <AuditPopover briefing={statusDetail} placement="right">
            <span aria-label={statusDetail} role="note" style={infoTipStyle}>
              ?
            </span>
          </AuditPopover>
        ) : null}

        {showDetails ? (
          <div style={detailsGridStyle}>
            <AuditPopover briefing="The exact model or endpoint currently selected for audit." block>
              <div style={detailTileStyle}>
                <span style={detailLabelStyle}>Model</span>
                <span style={detailValueStyle}>{modelName}</span>
              </div>
            </AuditPopover>
            <AuditPopover briefing="The runtime path that will execute or represent the model audit." block>
              <div style={detailTileStyle}>
                <span style={detailLabelStyle}>Runtime</span>
                <span style={detailValueStyle}>{provider}</span>
              </div>
            </AuditPopover>
            <AuditPopover briefing="The API route used to create and run the audit session." block>
              <div style={detailTileStyle}>
                <span style={detailLabelStyle}>API route</span>
                <span style={detailValueStyle}>{endpointLabel}</span>
              </div>
            </AuditPopover>
            <AuditPopover briefing="The latest backend state returned by the audit API." block>
              <div style={detailTileStyle}>
                <span style={detailLabelStyle}>Backend</span>
                <span style={detailValueStyle}>{lastChecked ?? 'Not checked'}</span>
              </div>
            </AuditPopover>
          </div>
        ) : null}

        <div style={actionRowStyle}>
          {status === 'connected' && onDisconnect ? (
            <button type="button" style={buttonStyle} onClick={onDisconnect}>
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              style={connectDisabled ? disabledButtonStyle : buttonStyle}
              onClick={onConnect}
              disabled={connectDisabled}
            >
              {status === 'connecting' ? 'Connecting selected model...' : 'Connect selected model'}
            </button>
          )}
          <button
            type="button"
            style={runDisabled ? disabledButtonStyle : primaryButtonStyle}
            onClick={onRunAudit}
            disabled={runDisabled}
          >
            {isAuditRunning ? 'Running CAS audit...' : 'Run CAS audit'}
          </button>
        </div>
      </div>
    </GlassPanel>
  );
}

export default ModelConnectionCard;
