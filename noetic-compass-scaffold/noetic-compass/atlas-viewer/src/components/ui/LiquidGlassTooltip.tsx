import { useId, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

import {
  ACCENT_TEAL,
  COLORS,
  FONT_FAMILY,
  FONT_MONO,
} from '../../lib/designTokens';

export type LiquidGlassTooltipPlacement = 'top' | 'bottom' | 'right';

export interface LiquidGlassTooltipProps {
  briefing: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  placement?: LiquidGlassTooltipPlacement;
  block?: boolean;
  width?: number;
  ariaLabel?: string;
  focusable?: boolean;
}

const triggerStyle = (block: boolean): CSSProperties => ({
  position: 'relative',
  display: block ? 'block' : 'inline-flex',
  width: block ? '100%' : undefined,
  outline: 'none',
});

const popoverBaseStyle: CSSProperties = {
  position: 'absolute',
  zIndex: 90,
  width: 'min(var(--liquid-tooltip-width, 300px), calc(100vw - 48px))',
  padding: '12px 14px',
  borderRadius: 2,
  border: `1px solid ${COLORS.borderInk}`,
  borderLeft: `3px solid ${ACCENT_TEAL}`,
  background: COLORS.card,
  boxShadow: 'none',
  color: COLORS.textPrimary,
  fontFamily: FONT_FAMILY,
  pointerEvents: 'none',
};

const placementStyle: Record<LiquidGlassTooltipPlacement, CSSProperties> = {
  top: {
    left: 0,
    bottom: 'calc(100% + 10px)',
  },
  bottom: {
    left: 0,
    top: 'calc(100% + 10px)',
  },
  right: {
    left: 'calc(100% + 10px)',
    top: 0,
  },
};

const eyebrowStyle: CSSProperties = {
  display: 'block',
  marginBottom: 6,
  color: ACCENT_TEAL,
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 1,
  textTransform: 'uppercase',
};

const bodyStyle: CSSProperties = {
  display: 'block',
  color: COLORS.textPrimary,
  fontSize: 12.5,
  lineHeight: 1.5,
  fontWeight: 400,
  letterSpacing: 0,
};

const glowStyle: CSSProperties = {
  display: 'none',
};

export function LiquidGlassTooltip({
  briefing,
  children,
  className,
  style,
  placement = 'top',
  block = false,
  width = 300,
  ariaLabel,
  focusable = true,
}: LiquidGlassTooltipProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const id = useId();
  const Trigger = block ? 'div' : 'span';

  const show = () => setOpen(true);
  const hide = () => setOpen(false);

  return (
    <Trigger
      aria-describedby={open ? id : undefined}
      aria-label={ariaLabel}
      className={className}
      onBlur={hide}
      onFocus={show}
      onMouseEnter={show}
      onMouseLeave={hide}
      onPointerEnter={show}
      onPointerLeave={hide}
      style={{ ...triggerStyle(block), ...style }}
      tabIndex={focusable ? 0 : undefined}
    >
      {children}
      <AnimatePresence>
        {open ? (
          <motion.span
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.985 }}
            id={id}
            initial={{ opacity: 0, y: placement === 'top' ? 4 : -4, scale: 0.985 }}
            role="tooltip"
            style={
              {
                ...popoverBaseStyle,
                ...placementStyle[placement],
                '--liquid-tooltip-width': `${width}px`,
              } as CSSProperties
            }
            transition={{ duration: 0.11, ease: [0.16, 1, 0.3, 1] }}
          >
            <span aria-hidden="true" style={glowStyle} />
            <span style={{ position: 'relative' }}>
              <span style={eyebrowStyle}>Briefing</span>
              <span style={bodyStyle}>{briefing}</span>
            </span>
          </motion.span>
        ) : null}
      </AnimatePresence>
    </Trigger>
  );
}

export default LiquidGlassTooltip;
