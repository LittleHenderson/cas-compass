import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PageShell } from './PageShell';
import { MOTION_PAUSED_STORAGE_KEY } from '../../lib/motionPause';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.motionPaused;
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete document.documentElement.dataset.motionPaused;
});

describe('PageShell — unified CAS Lab + CAS Compass shell', () => {
  it('renders Row 1 caslab-bar, Row 2 brand/nav/cross-links, skip-link, and CAS Lab footer', () => {
    render(
      <MemoryRouter initialEntries={['/audit-console']}>
        <PageShell>
          <div>Console content</div>
        </PageShell>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveClass('skip-link');

    const casLabLink = screen.getByRole('link', { name: /← CAS Lab/i });
    expect(casLabLink).toHaveAttribute('href', 'https://www.caslabai.com/#research');
    expect(screen.getByText('CAS Compass · Audit & 3D Cockpit')).toBeInTheDocument();

    expect(screen.getByText('CAS HARNESS AUDIT')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Model' })).toHaveAttribute('href', '/model-config');
    expect(screen.getByRole('link', { name: 'Audit Console' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '3D Cockpit' })).toHaveAttribute('href', '/cockpit');
    expect(screen.getByRole('link', { name: /Workbench/i })).toHaveAttribute(
      'href',
      'https://compass.caslabai.com/scenarios',
    );
    expect(screen.getByRole('link', { name: /CAS Compiler/i })).toHaveAttribute(
      'href',
      'https://www.caslabai.com/compiler/',
    );

    const footerCasLab = screen.getByRole('link', { name: 'CAS Lab' });
    expect(footerCasLab).toHaveAttribute('href', 'https://www.caslabai.com');
    expect(screen.getByText(/Zero analytics/i)).toBeInTheDocument();
    expect(screen.getByText(/Customer-production status is OPEN/i)).toBeInTheDocument();
  });

  it('toggles Pause motion and persists to localStorage["cas_motion_paused"] and html[data-motion-paused]', () => {
    render(
      <MemoryRouter initialEntries={['/model-config']}>
        <PageShell>
          <div>Model content</div>
        </PageShell>
      </MemoryRouter>,
    );

    const toggle = screen.getByTestId('pause-motion-toggle');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.motionPaused).toBe('false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(document.documentElement.dataset.motionPaused).toBe('true');
    expect(localStorage.getItem(MOTION_PAUSED_STORAGE_KEY)).toBe('true');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(document.documentElement.dataset.motionPaused).toBe('false');
    expect(localStorage.getItem(MOTION_PAUSED_STORAGE_KEY)).toBe('false');
  });
});
