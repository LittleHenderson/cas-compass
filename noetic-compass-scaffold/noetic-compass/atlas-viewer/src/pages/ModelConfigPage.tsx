import { useState, type CSSProperties } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { GlassPanel } from '../components/ui/GlassPanel';
import { PageShell } from '../components/ui/PageShell';
import {
  ACCENT_TEAL,
  COLORS,
  FONT_DISPLAY,
  FONT_MONO,
  SPRING_SNAPPY,
} from '../lib/designTokens';

interface ModelOption {
  id: string;
  family: string;
  size: string;
  layers: number;
  available: boolean;
  notes: string;
}

const MODELS: ModelOption[] = [
  {
    id: 'pythia-160m',
    family: 'Pythia',
    size: '160M',
    layers: 12,
    available: true,
    notes:
      'Hosted real-weight target. The connect step verifies the live Pythia worker before any audit runs.',
  },
  {
    id: 'qwen2.5-1.5b',
    family: 'Qwen 2.5',
    size: '1.5B',
    layers: 28,
    available: false,
    notes: 'Cross-architecture comparison target. Wiring in roadmap item #6.',
  },
  {
    id: 'custom-byo',
    family: 'External / BYO',
    size: '—',
    layers: 0,
    available: false,
    notes:
      'Bring-your-own-model attachment via the Architecture Mapper. Roadmap items #6 + #7.',
  },
];

const eyebrowStyle: CSSProperties = {
  margin: '0 0 8px 0',
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: ACCENT_TEAL,
};

const headingStyle: CSSProperties = {
  margin: 0,
  fontFamily: FONT_DISPLAY,
  fontSize: 26,
  fontWeight: 700,
  letterSpacing: -0.3,
  color: COLORS.textPrimary,
};

const subheadingStyle: CSSProperties = {
  margin: '8px 0 18px 0',
  fontSize: 13.5,
  lineHeight: 1.55,
  color: COLORS.textSecondary,
};

const listStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  marginBottom: 16,
};

const rowStyle = (active: boolean, available: boolean): CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  alignItems: 'center',
  gap: 12,
  padding: '13px 14px',
  borderRadius: 2,
  border: active
    ? `1px solid ${ACCENT_TEAL}`
    : `1px solid ${COLORS.rule}`,
  background: active ? COLORS.stripe : COLORS.ground,
  cursor: available ? 'pointer' : 'not-allowed',
  opacity: available ? 1 : 0.55,
  transition: 'border-color 0.15s ease, background 0.15s ease',
});

const rowTitleStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  fontFamily: FONT_DISPLAY,
  fontSize: 15,
  fontWeight: 600,
  color: COLORS.textPrimary,
};

const rowMetaStyle: CSSProperties = {
  fontSize: 11.5,
  color: COLORS.textMuted,
  fontFamily: FONT_MONO,
};

const rowNotesStyle: CSSProperties = {
  marginTop: 4,
  fontSize: 12.5,
  lineHeight: 1.5,
  color: COLORS.textSecondary,
};

const tagStyle = (kind: 'live' | 'soon'): CSSProperties => ({
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 0.9,
  textTransform: 'uppercase',
  padding: '3px 8px',
  borderRadius: 2,
  background: kind === 'live' ? COLORS.card : COLORS.ground,
  border:
    kind === 'live'
      ? `1px solid ${ACCENT_TEAL}`
      : `1px dashed ${COLORS.dash}`,
  color: kind === 'live' ? ACCENT_TEAL : COLORS.textMuted,
});

const buttonStyle: CSSProperties = {
  width: '100%',
  marginTop: 6,
  padding: '11px 16px',
  borderRadius: 2,
  border: `1px solid ${ACCENT_TEAL}`,
  background: ACCENT_TEAL,
  color: COLORS.ground,
  fontSize: 13.5,
  fontWeight: 700,
  letterSpacing: 0.2,
  fontFamily: FONT_DISPLAY,
  cursor: 'pointer',
};

const footnoteStyle: CSSProperties = {
  marginTop: 16,
  paddingTop: 14,
  borderTop: `1px dashed ${COLORS.dash}`,
  fontFamily: FONT_MONO,
  fontSize: 11.5,
  lineHeight: 1.55,
  color: COLORS.textMuted,
};

export default function ModelConfigPage() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string>('pythia-160m');

  return (
    <PageShell cardMaxWidth={560}>
      <GlassPanel intensity="regular" padding={24} ariaLabel="Choose a model">
        <p style={eyebrowStyle}>CAS Compass · Step 01</p>
        <h1 style={headingStyle}>Choose a model</h1>
        <p style={subheadingStyle}>
          Pythia-160M is available through the hosted live worker. The connect step
          verifies real-weight authority before an audit can run.
        </p>

        <div style={listStyle} role="radiogroup" aria-label="Available models">
          {MODELS.map((model) => {
            const active = selected === model.id;
            return (
              <div
                key={model.id}
                role="radio"
                aria-checked={active}
                aria-disabled={!model.available}
                tabIndex={model.available ? 0 : -1}
                onClick={() => {
                  if (model.available) setSelected(model.id);
                }}
                onKeyDown={(event) => {
                  if (!model.available) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelected(model.id);
                  }
                }}
                style={rowStyle(active, model.available)}
                data-testid={`model-row-${model.id}`}
              >
                <div>
                  <div style={rowTitleStyle}>
                    <span>{model.family}</span>
                    <span style={rowMetaStyle}>
                      {model.size}
                      {model.layers > 0 ? ` · ${model.layers} layers` : ''}
                    </span>
                  </div>
                  <div style={rowNotesStyle}>{model.notes}</div>
                </div>
                <span style={tagStyle(model.available ? 'live' : 'soon')}>
                  {model.available ? 'Live' : 'Soon'}
                </span>
              </div>
            );
          })}
        </div>

        <motion.button
          type="button"
          style={buttonStyle}
          whileHover={{
            opacity: 0.92,
          }}
          whileTap={{ scale: 0.99 }}
          transition={SPRING_SNAPPY}
          onClick={() => navigate(`/audit-console?model=${encodeURIComponent(selected)}`)}
          data-testid="continue-to-audit"
        >
          Choose model for CAS audit
        </motion.button>

        <p style={footnoteStyle}>
          External model attachment (BYO weights, BYO endpoints) is roadmap
          item #6. The Architecture Mapper (item #7) selects probe targets
          inside an attached model.
        </p>
      </GlassPanel>
    </PageShell>
  );
}
