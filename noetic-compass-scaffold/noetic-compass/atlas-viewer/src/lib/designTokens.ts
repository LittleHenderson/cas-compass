// CAS Lab Biolume design tokens — editorial 2px geometry, solid dark
// surfaces (#050b0a ground, #0c1513 card, #13201c stripe), crisp 1px rules
// (#20302b / #eaf3ee), bioluminescent emerald accent (#37f5a0), Space Grotesk
// display headings, Geist body, and Geist Mono uppercase telemetry labels.

export const BIOLUME = {
  ground: '#050b0a',
  card: '#0c1513',
  stripe: '#13201c',
  rule2: '#17231f',
  rule: '#20302b',
  dash: '#62706a',
  text: '#eaf3ee',
  body: '#b3c2ba',
  muted: '#86958d',
  accent: '#37f5a0',
  error: '#ff7b72',
  warn: '#f59e0b',
} as const;

export const GLASS_PANEL_FILL = BIOLUME.card;
export const GLASS_PANEL_BORDER = `1px solid ${BIOLUME.rule}`;
export const GLASS_PANEL_SHADOW = 'none';
export const GLASS_BLUR = 'none';
export const GLASS_RADIUS = 2;

export const GLASS_BLUR_THIN = 'none';
export const GLASS_BLUR_REGULAR = 'none';
export const GLASS_BLUR_THICK = 'none';

export const SPRING_SNAPPY = { type: 'spring', stiffness: 420, damping: 38 } as const;
export const SPRING_GENTLE = { type: 'spring', stiffness: 260, damping: 34 } as const;
export const EASE_OUT_CUBIC = [0.33, 1, 0.68, 1] as const;
export const STAGGER_CHILDREN = 0.04;

// Token names preserved for back-compat across existing imports; values map
// to the CAS Lab Biolume palette.
export const ACCENT_BLUE = BIOLUME.accent;
export const ACCENT_TEAL = BIOLUME.accent;
export const ACCENT_CYAN = BIOLUME.accent;
export const ACCENT_AMBER = BIOLUME.warn;
export const ACCENT_ERROR = BIOLUME.error;

export const FONT_DISPLAY =
  "'Space Grotesk', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

export const FONT_UNBOUNDED =
  "'Unbounded', 'Space Grotesk', system-ui, -apple-system, sans-serif";

export const FONT_FAMILY =
  "'Geist', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const FONT_MONO =
  "'Geist Mono', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

export const COLORS = {
  ...BIOLUME,
  textPrimary: BIOLUME.text,
  textSecondary: BIOLUME.body,
  textMuted: BIOLUME.muted,
  textFaint: BIOLUME.dash,
  bgDeep: BIOLUME.ground,
  bgPanel: BIOLUME.card,
  bgPanelHover: BIOLUME.stripe,
  borderSubtle: BIOLUME.rule2,
  borderStrong: BIOLUME.rule,
  borderInk: BIOLUME.text,
} as const;

export const RADIUS = {
  sm: 2,
  md: 2,
  lg: 2,
  xl: 2,
} as const;

export const THEME = {
  BIOLUME,
  GLASS_PANEL_FILL,
  GLASS_PANEL_BORDER,
  GLASS_PANEL_SHADOW,
  GLASS_BLUR,
  GLASS_BLUR_THIN,
  GLASS_BLUR_REGULAR,
  GLASS_BLUR_THICK,
  GLASS_RADIUS,
  SPRING_SNAPPY,
  SPRING_GENTLE,
  EASE_OUT_CUBIC,
  STAGGER_CHILDREN,
  ACCENT_BLUE,
  ACCENT_TEAL,
  ACCENT_CYAN,
  ACCENT_AMBER,
  ACCENT_ERROR,
  fontDisplay: FONT_DISPLAY,
  fontUnbounded: FONT_UNBOUNDED,
  fontFamily: FONT_FAMILY,
  fontMono: FONT_MONO,
  colors: COLORS,
  radius: RADIUS,
} as const;

export type GlassIntensity = 'thin' | 'regular' | 'thick';

export function glassBlurFor(intensity: GlassIntensity): string {
  if (intensity === 'thin') return GLASS_BLUR_THIN;
  if (intensity === 'thick') return GLASS_BLUR_THICK;
  return GLASS_BLUR_REGULAR;
}
