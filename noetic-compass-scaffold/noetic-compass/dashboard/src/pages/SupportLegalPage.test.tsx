import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { SupportLegalPage } from './SupportLegalPage';

const VALID_NOTICE = {
  privacy_url: 'https://cascompass.ai/privacy',
  privacy_notice_version: '2026-08-01',
  privacy_notice_content_sha256: 'a'.repeat(64),
  privacy_notice_publication_status: 'present',
};

const server = setupServer();

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/support" element={<SupportLegalPage />} />
        <Route path="/legal" element={<SupportLegalPage />} />
        <Route path="/privacy" element={<SupportLegalPage />} />
        <Route path="/terms" element={<SupportLegalPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SupportLegalPage', () => {
  it('switches tabs based on pathname and renders exact claim-status vocabulary on /legal', () => {
    renderAt('/legal');
    expect(
      screen.getByRole('heading', { name: /Legal notices and public-beta boundaries/i }),
    ).toBeInTheDocument();

    for (const term of [
      'ACCEPT',
      'FLAG_FOR_HUMAN_REVIEW',
      'LICENSED',
      'NOT LICENSED',
      'OPEN',
      'present',
      'unavailable',
    ]) {
      expect(screen.getAllByText(term).length).toBeGreaterThan(0);
    }
  });

  it('renders privacy and terms draft disclosures on /privacy and /terms', () => {
    renderAt('/privacy');
    expect(
      screen.getByRole('heading', { name: /Privacy boundaries for the landing site and beta requests/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/July 14, 2026/i)).toBeInTheDocument();

    cleanup();
    renderAt('/terms');
    expect(
      screen.getByRole('heading', { name: /Terms for evaluation-access requests/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/A request is not an entitlement/i)).toBeInTheDocument();
  });

  it('fails closed and disables ticket fields when privacy notice status is not present', async () => {
    server.use(
      http.get('/api/api/support/public/privacy-notice', () =>
        HttpResponse.json(
          { detail: 'Privacy Notice publication status is OPEN.' },
          { status: 503, headers: { 'Cache-Control': 'no-store' } },
        ),
      ),
    );

    renderAt('/support');

    await waitFor(() => {
      expect(screen.getByTestId('privacy-notice-gate-status')).toHaveTextContent(
        /unavailable \/ OPEN/i,
      );
    });

    expect(screen.getByRole('button', { name: /Create support ticket/i })).toBeDisabled();
    expect(screen.getByLabelText(/^Email$/i)).toBeDisabled();
  });

  it('re-fetches privacy notice before POST and submits ticket when notice status is present', async () => {
    let noticeFetches = 0;
    let postedBody: Record<string, unknown> | null = null;

    server.use(
      http.get('/api/api/support/public/privacy-notice', () => {
        noticeFetches += 1;
        return HttpResponse.json(VALID_NOTICE, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store, max-age=0',
          },
        });
      }),
      http.post('/api/api/support/public/tickets', async ({ request }) => {
        postedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ticket_id: 'SUP-4242' }, { status: 201 });
      }),
    );

    const user = userEvent.setup();
    renderAt('/support');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Create support ticket/i })).toBeEnabled();
    });

    await user.type(screen.getByLabelText(/^Email$/i), 'auditor@example.com');
    await user.type(screen.getByLabelText(/^Subject$/i), 'Beta evaluation question');
    await user.type(screen.getByLabelText(/^Message$/i), 'Requesting access details.');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /Create support ticket/i }));

    await waitFor(() => {
      expect(screen.getByText(/Request received\. Ticket ID: SUP-4242\./i)).toBeInTheDocument();
    });

    expect(noticeFetches).toBeGreaterThanOrEqual(2);
    expect(postedBody).toMatchObject({
      email: 'auditor@example.com',
      subject: 'Beta evaluation question',
      source: 'cascompass_contact',
      consent_to_contact: true,
      privacy_notice_version: '2026-08-01',
      privacy_notice_content_sha256: 'a'.repeat(64),
    });
  });
});
