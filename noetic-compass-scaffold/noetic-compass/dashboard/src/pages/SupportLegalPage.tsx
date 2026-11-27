import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { API_BASE } from '../api/config';

type SupportLegalTab = 'support' | 'legal' | 'privacy' | 'terms';

interface PublishedPrivacyNotice {
  privacy_url: string;
  privacy_notice_version: string;
  privacy_notice_content_sha256: string;
  privacy_notice_publication_status: 'present';
}

type NoticeGateState =
  | { status: 'checking'; detail: string }
  | { status: 'present'; detail: string }
  | { status: 'unavailable'; detail: string };

const EXPECTED_NOTICE_URL = 'https://cascompass.ai/privacy';
const NOTICE_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const NOTICE_DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const EXPECTED_NOTICE_KEYS = [
  'privacy_notice_content_sha256',
  'privacy_notice_publication_status',
  'privacy_notice_version',
  'privacy_url',
] as const;

const TABS: ReadonlyArray<{ id: SupportLegalTab; label: string; to: string }> = [
  { id: 'support', label: 'Support', to: '/support' },
  { id: 'legal', label: 'Legal', to: '/legal' },
  { id: 'privacy', label: 'Privacy', to: '/privacy' },
  { id: 'terms', label: 'Terms', to: '/terms' },
];

const CLAIM_VOCABULARY: ReadonlyArray<{ term: string; definition: string }> = [
  {
    term: 'ACCEPT',
    definition:
      'A verifier-backed product decision. It is not inferred from research evidence alone.',
  },
  {
    term: 'FLAG_FOR_HUMAN_REVIEW',
    definition: 'A preserved signal that requires an authorized human decision.',
  },
  {
    term: 'LICENSED',
    definition: 'A positive entitlement signal for the specified account, model, or run.',
  },
  {
    term: 'NOT LICENSED',
    definition: 'An explicit negative entitlement result for the specified scope.',
  },
  {
    term: 'OPEN',
    definition:
      'Unresolved work or an unfinished claim boundary. It must not be presented as complete.',
  },
  {
    term: 'present',
    definition:
      'The named proof artifact or service signal was observed in the specified packet or run.',
  },
  {
    term: 'unavailable',
    definition:
      'The named proof artifact or service signal was not returned or could not be checked.',
  },
];

function resolveSupportEndpoint(path: '/api/support/public/privacy-notice' | '/api/support/public/tickets'): string {
  const base = API_BASE.replace(/\/+$/, '');
  return `${base}${path}`;
}

function activeTabFromPath(pathname: string): SupportLegalTab {
  const normalized = pathname.replace(/\/+$/, '').toLowerCase();
  if (normalized === '/legal') return 'legal';
  if (normalized === '/privacy') return 'privacy';
  if (normalized === '/terms') return 'terms';
  return 'support';
}

export function parsePublishedPrivacyNotice(body: unknown): PublishedPrivacyNotice {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new Error('The published Privacy Notice metadata is malformed.');
  }
  const record = body as Record<string, unknown>;
  const actualKeys = Object.keys(record).sort();
  if (JSON.stringify(actualKeys) !== JSON.stringify([...EXPECTED_NOTICE_KEYS])) {
    throw new Error('The published Privacy Notice metadata is malformed.');
  }
  if (
    record.privacy_url !== EXPECTED_NOTICE_URL ||
    record.privacy_notice_publication_status !== 'present' ||
    typeof record.privacy_notice_version !== 'string' ||
    !NOTICE_VERSION_PATTERN.test(record.privacy_notice_version) ||
    typeof record.privacy_notice_content_sha256 !== 'string' ||
    !NOTICE_DIGEST_PATTERN.test(record.privacy_notice_content_sha256)
  ) {
    throw new Error('The published Privacy Notice metadata is unavailable.');
  }
  return {
    privacy_url: record.privacy_url,
    privacy_notice_version: record.privacy_notice_version,
    privacy_notice_content_sha256: record.privacy_notice_content_sha256,
    privacy_notice_publication_status: 'present',
  };
}

async function fetchPublishedPrivacyNotice(): Promise<PublishedPrivacyNotice> {
  const response = await fetch(resolveSupportEndpoint('/api/support/public/privacy-notice'), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail =
      typeof body.detail === 'string'
        ? body.detail
        : 'The published Privacy Notice metadata is unavailable.';
    throw new Error(detail);
  }
  const contentType = String(response.headers.get('Content-Type') || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  const cacheControl = String(response.headers.get('Cache-Control') || '')
    .split(',')
    .map((value) => value.trim().toLowerCase());
  if (contentType !== 'application/json' || !cacheControl.includes('no-store')) {
    throw new Error('The published Privacy Notice metadata is malformed.');
  }
  return parsePublishedPrivacyNotice(body);
}

const INPUT_CLASS =
  'w-full rounded-[2px] border border-[#20302b] bg-[#050b0a] px-3 py-2 text-sm text-[#eaf3ee] placeholder:text-[#86958d] focus:border-[#37f5a0] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50';

function SupportPanel() {
  // Never store privacy_notice_version or privacy_notice_content_sha256 in state
  // across attempts. We probe availability only to gate PII capture, and resolve
  // a fresh notice immediately before every POST.
  const [noticeGate, setNoticeGate] = useState<NoticeGateState>({
    status: 'checking',
    detail: 'Checking published Privacy Notice publication status…',
  });
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [statusTone, setStatusTone] = useState<'neutral' | 'success' | 'error'>('neutral');

  const checkNoticeGate = useCallback(async () => {
    setNoticeGate({
      status: 'checking',
      detail: 'Checking published Privacy Notice publication status…',
    });
    try {
      await fetchPublishedPrivacyNotice();
      setNoticeGate({
        status: 'present',
        detail: 'Published Privacy Notice status: present. Tracked ticket intake is active.',
      });
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'The published Privacy Notice metadata is unavailable.';
      setNoticeGate({
        status: 'unavailable',
        detail,
      });
    }
  }, []);

  useEffect(() => {
    void checkNoticeGate();
  }, [checkNoticeGate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (noticeGate.status !== 'present') {
      setStatusTone('error');
      setStatusMessage(
        'Support intake is temporarily unavailable while Privacy Notice publication status is not present. Use the email fallback below.',
      );
      return;
    }
    if (!form.reportValidity()) return;

    setSubmitting(true);
    setStatusTone('neutral');
    setStatusMessage('Checking the current published Privacy Notice…');

    try {
      // Resolve the notice immediately before every submission. No legal
      // version or digest is baked into the bundle or retained across
      // attempts; an OPEN, invalid, unavailable, or changed notice blocks PII.
      const notice = await fetchPublishedPrivacyNotice();
      const data = new FormData(form);
      const payload = {
        email: String(data.get('email') || ''),
        name: String(data.get('name') || ''),
        organization: String(data.get('organization') || ''),
        category: String(data.get('category') || 'product_support'),
        subject: String(data.get('subject') || ''),
        message: String(data.get('message') || ''),
        website: String(data.get('website') || ''),
        source: 'cascompass_contact',
        consent_to_contact: data.get('consent_to_contact') === 'on',
        privacy_notice_version: notice.privacy_notice_version,
        privacy_notice_content_sha256: notice.privacy_notice_content_sha256,
      };
      setStatusMessage('Submitting your support request…');
      const response = await fetch(resolveSupportEndpoint('/api/support/public/tickets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const detail =
          typeof body.detail === 'string'
            ? body.detail
            : 'The request could not be recorded.';
        throw new Error(detail);
      }
      setStatusTone('success');
      setStatusMessage(
        `Request received. Ticket ID: ${String(body.ticket_id || 'unavailable')}.`,
      );
      form.reset();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Unknown error';
      setStatusTone('error');
      setStatusMessage(
        `Support intake is temporarily unavailable: ${detail} Use the email fallback below.`,
      );
      if (detail.toLowerCase().includes('privacy notice')) {
        setNoticeGate({ status: 'unavailable', detail });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const formBlocked = noticeGate.status !== 'present';

  return (
    <div className="space-y-6">
      <section
        aria-labelledby="support-form-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Support request
        </p>
        <h2
          id="support-form-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Create a tracked support ticket
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[#b3c2ba]">
          This form records a ticket ID and response target. Submission is not an
          acknowledgement or resolution; those require a recorded support-operator action.
        </p>

        {/* Fail-closed Privacy Notice gate indicator */}
        <div
          role="status"
          aria-live="polite"
          data-testid="privacy-notice-gate-status"
          className={`mt-4 rounded-[2px] px-4 py-3 text-xs leading-relaxed ${
            noticeGate.status === 'present'
              ? 'border border-[#37f5a0]/40 bg-[#13201c] text-[#eaf3ee]'
              : 'border border-dashed border-[#f59e0b]/70 bg-[#13201c] text-[#eaf3ee]'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
              <span
                className={
                  noticeGate.status === 'present' ? 'text-[#37f5a0]' : 'text-[#f59e0b]'
                }
              >
                Privacy Notice publication status:{' '}
                {noticeGate.status === 'present'
                  ? 'present'
                  : noticeGate.status === 'checking'
                    ? 'checking'
                    : 'unavailable / OPEN'}
              </span>
            </div>
            {noticeGate.status === 'unavailable' && (
              <button
                type="button"
                onClick={() => void checkNoticeGate()}
                className="rounded-[2px] border border-[#eaf3ee] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
              >
                Re-check notice
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[#b3c2ba]">{noticeGate.detail}</p>
          {noticeGate.status === 'unavailable' && (
            <p className="mt-1.5 text-[#f59e0b]">
              Ticket fields are disabled so no personal information is captured while Privacy
              Notice publication status is not <code>present</code>. Use the email fallback below.
            </p>
          )}
        </div>

        <form id="support-form" onSubmit={handleSubmit} className="mt-5 space-y-4">
          <fieldset disabled={formBlocked} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
                  Email
                </span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={320}
                  required
                  className={INPUT_CLASS}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
                  Name
                </span>
                <input
                  name="name"
                  autoComplete="name"
                  maxLength={200}
                  className={INPUT_CLASS}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
                  Organization
                </span>
                <input
                  name="organization"
                  autoComplete="organization"
                  maxLength={200}
                  className={INPUT_CLASS}
                />
              </label>

              <label className="block space-y-1.5">
                <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
                  Category
                </span>
                <select name="category" defaultValue="product_support" className={INPUT_CLASS}>
                  <option value="product_support">Product support</option>
                  <option value="early_access">Early access</option>
                  <option value="privacy">Privacy</option>
                  <option value="security">Security</option>
                  <option value="legal">Legal notice</option>
                </select>
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
                Subject
              </span>
              <input name="subject" maxLength={240} required className={INPUT_CLASS} />
            </label>

            <label className="block space-y-1.5">
              <span className="block font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
                Message
              </span>
              <textarea
                name="message"
                rows={7}
                maxLength={8000}
                required
                className={INPUT_CLASS}
              />
            </label>

            {/* Honeypot — hidden from assistive tech and visual layout */}
            <label className="sr-only" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>

            <label className="flex items-start gap-2.5 text-sm text-[#b3c2ba]">
              <input
                name="consent_to_contact"
                type="checkbox"
                required
                className="mt-1 h-4 w-4 rounded-[2px] border border-[#20302b] bg-[#050b0a] accent-[#37f5a0]"
              />
              <span>
                I consent to a reply about this request and have read the{' '}
                <Link to="/privacy" className="text-[#37f5a0] underline-offset-2 hover:underline">
                  Privacy Notice
                </Link>
                .
              </span>
            </label>

            <button
              type="submit"
              disabled={formBlocked || submitting}
              className="rounded-[2px] bg-[#37f5a0] px-5 py-2.5 text-sm font-semibold text-[#050b0a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? 'Submitting…' : 'Create support ticket'}
            </button>
          </fieldset>

          {statusMessage && (
            <p
              id="support-status"
              role="status"
              aria-live="polite"
              className={`text-xs font-mono leading-relaxed ${
                statusTone === 'success'
                  ? 'text-[#37f5a0]'
                  : statusTone === 'error'
                    ? 'text-[#ff7b72]'
                    : 'text-[#b3c2ba]'
              }`}
            >
              {statusMessage}
            </p>
          )}
        </form>
      </section>

      <section
        aria-labelledby="channels-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Email fallback
        </p>
        <h2
          id="channels-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          hello@cascompass.ai
        </h2>
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {[
            ['Request early access', 'mailto:hello@cascompass.ai?subject=CAS%20Compass%20early%20access'],
            ['Privacy question or request', 'mailto:hello@cascompass.ai?subject=CAS%20Compass%20privacy%20request'],
            ['Legal-notice question', 'mailto:hello@cascompass.ai?subject=CAS%20Compass%20legal%20notice%20question'],
            ['Responsible security report', 'mailto:hello@cascompass.ai?subject=CAS%20Compass%20security%20report'],
          ].map(([label, href]) => (
            <a
              key={href}
              href={href}
              className="rounded-[2px] border border-[#20302b] bg-[#13201c] px-4 py-2.5 text-sm font-medium text-[#eaf3ee] transition-colors hover:border-[#37f5a0] hover:text-[#37f5a0]"
            >
              {label}
            </a>
          ))}
        </div>
        <p className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/60 bg-[#13201c] px-4 py-3 text-xs leading-relaxed text-[#b3c2ba]">
          Do not include passwords, access tokens, payment-card data, private keys,
          regulated data, or production secrets in the first message.
        </p>
      </section>
    </div>
  );
}

function LegalPanel() {
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="legal-boundary-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          CAS Compass legal notices
        </p>
        <h2
          id="legal-boundary-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Legal notices and public-beta boundaries
        </h2>
        <p className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/60 bg-[#13201c] px-4 py-3 text-sm leading-relaxed text-[#eaf3ee]">
          Legal publication status: <code className="font-mono text-[#f59e0b]">OPEN</code>. These
          operational notices remain{' '}
          <code className="font-mono text-[#f59e0b]">FLAG_FOR_HUMAN_REVIEW</code> by qualified
          counsel. They are not legal approval and do not mark customer-production{' '}
          <code className="font-mono text-[#37f5a0]">ACCEPT</code>.
        </p>
      </section>

      <section
        aria-labelledby="scope-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">Scope</p>
        <h2
          id="scope-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Evaluation access only
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#b3c2ba]">
          CAS Compass is an early-access request and information surface. Beta audit outputs are
          evidence-backed evaluation materials; they are not legal advice, safety certification, or
          a substitute for an independent decision-maker.
        </p>
        <p className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/60 bg-[#13201c] px-4 py-3 text-xs leading-relaxed text-[#b3c2ba]">
          The contracting entity, governing terms, and final policy effective dates remain{' '}
          <code className="font-mono text-[#f59e0b]">OPEN</code> pending owner and
          qualified-counsel approval.
        </p>
      </section>

      <section
        aria-labelledby="legend-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Claim status legend
        </p>
        <h2
          id="legend-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Exact product vocabulary
        </h2>
        <dl className="mt-4 divide-y divide-[#20302b] border border-[#20302b] bg-[#13201c]">
          {CLAIM_VOCABULARY.map((entry) => (
            <div
              key={entry.term}
              className="grid gap-2 px-4 py-3 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-baseline"
            >
              <dt className="font-mono text-xs font-semibold text-[#37f5a0]">{entry.term}</dt>
              <dd className="text-sm leading-relaxed text-[#b3c2ba]">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function PrivacyPanel() {
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="privacy-boundary-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          CAS Compass privacy notice
        </p>
        <h2
          id="privacy-boundary-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Privacy boundaries for the landing site and beta requests
        </h2>
        <p className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/60 bg-[#13201c] px-4 py-3 text-sm leading-relaxed text-[#eaf3ee]">
          Privacy publication status: <code className="font-mono text-[#f59e0b]">OPEN</code>. This
          draft remains <code className="font-mono text-[#f59e0b]">FLAG_FOR_HUMAN_REVIEW</code> by
          qualified counsel and does not mark customer-production{' '}
          <code className="font-mono text-[#37f5a0]">ACCEPT</code>.
        </p>
      </section>

      <section
        aria-labelledby="collection-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Current public surface
        </p>
        <h2
          id="collection-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          What the public surface collects
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#b3c2ba]">
          <li>
            The version-controlled landing pages contain no account form and run no client-side
            application code.
          </li>
          <li>
            The early-access link opens an email addressed to hello@cascompass.ai; the sender
            chooses what the message contains.
          </li>
          <li>
            Hosting and email providers may process ordinary request or delivery metadata while
            providing their services.
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="beta-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Invited beta work
        </p>
        <h2
          id="beta-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Audit data requires a separate agreement
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#b3c2ba]">
          If beta access is offered, audit inputs, generated outputs, run metadata, and evidence
          artifacts may be processed to perform and verify the requested evaluation. The written
          beta agreement and disclosed runtime configuration control that work.
        </p>
        <p className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/60 bg-[#13201c] px-4 py-3 text-xs leading-relaxed text-[#b3c2ba]">
          Do not submit regulated data, confidential data, personal secrets, access credentials, or
          production keys through the public email link. Final retention, deletion, and data-subject
          procedures remain <code className="font-mono text-[#f59e0b]">OPEN</code>.
        </p>
      </section>

      <section
        aria-labelledby="requests-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Questions and requests
        </p>
        <h2
          id="requests-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Contact the project
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#b3c2ba]">
          Send privacy questions or requests to{' '}
          <a
            href="mailto:hello@cascompass.ai?subject=CAS%20Compass%20privacy%20request"
            className="text-[#37f5a0] underline-offset-2 hover:underline"
          >
            hello@cascompass.ai
          </a>
          . Include only the information needed to identify the request.
        </p>
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-[#86958d]">
          Draft notice · Last source revision: July 14, 2026
        </p>
      </section>
    </div>
  );
}

function TermsPanel() {
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="terms-boundary-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          CAS Compass beta terms
        </p>
        <h2
          id="terms-boundary-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Terms for evaluation-access requests
        </h2>
        <p className="mt-4 rounded-[2px] border border-dashed border-[#f59e0b]/60 bg-[#13201c] px-4 py-3 text-sm leading-relaxed text-[#eaf3ee]">
          Terms publication status: <code className="font-mono text-[#f59e0b]">OPEN</code>. This
          draft remains <code className="font-mono text-[#f59e0b]">FLAG_FOR_HUMAN_REVIEW</code> by
          qualified counsel and does not mark customer-production{' '}
          <code className="font-mono text-[#37f5a0]">ACCEPT</code>.
        </p>
      </section>

      <section
        aria-labelledby="evaluation-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Evaluation boundary
        </p>
        <h2
          id="evaluation-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          A request is not an entitlement
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#b3c2ba]">
          Submitting an early-access email does not create an account, purchase, service
          commitment, or license. Access begins only after the project sends written confirmation
          for the specified evaluation scope.
        </p>
      </section>

      <section
        aria-labelledby="evidence-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Evidence boundary
        </p>
        <h2
          id="evidence-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Outputs require scoped interpretation
        </h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#b3c2ba]">
          <li>Audit outputs are evaluation materials, not legal advice or safety certification.</li>
          <li>
            A <code className="font-mono text-[#37f5a0]">present</code> artifact records an
            observation in its stated scope;{' '}
            <code className="font-mono text-[#f59e0b]">unavailable</code> records a missing or
            unchecked signal.
          </li>
          <li>
            <code className="font-mono text-[#37f5a0]">LICENSED</code> and{' '}
            <code className="font-mono text-[#ff7b72]">NOT LICENSED</code> are entitlement signals
            for a specified scope, not general product approval.
          </li>
          <li>
            <code className="font-mono text-[#f59e0b]">FLAG_FOR_HUMAN_REVIEW</code> must not be
            presented as <code className="font-mono text-[#37f5a0]">ACCEPT</code>.
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="final-title"
        className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6"
      >
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          Final agreement
        </p>
        <h2
          id="final-title"
          className="mt-2 font-['Space_Grotesk',sans-serif] text-xl font-semibold text-[#eaf3ee]"
        >
          Written beta terms control invited work
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-[#b3c2ba]">
          Any invited evaluation is governed by the written scope and data boundaries supplied for
          that engagement. Final commercial terms, support commitments, governing law, and dispute
          provisions remain <code className="font-mono text-[#f59e0b]">OPEN</code> pending owner
          and qualified-counsel approval.
        </p>
      </section>
    </div>
  );
}

export function SupportLegalPage() {
  const location = useLocation();
  const activeTab = activeTabFromPath(location.pathname);

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-20">
      <header className="rounded-[2px] border border-[#20302b] bg-[#0c1513] p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
          CAS Lab · CAS Compass
        </p>
        <h1 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold tracking-tight text-[#eaf3ee] sm:text-3xl">
          Support &amp; Legal Notices
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[#b3c2ba]">
          Tracked support intake, legal notices, privacy boundaries, and beta terms for CAS Compass.
          Customer-production status remains <code className="font-mono text-[#f59e0b]">OPEN</code>.
        </p>

        <nav
          aria-label="Support and legal sections"
          className="mt-5 flex flex-wrap gap-2 border-t border-[#20302b] pt-4"
        >
          {TABS.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                to={tab.to}
                aria-current={isActive ? 'page' : undefined}
                className={`rounded-[2px] border px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] transition-colors ${
                  isActive
                    ? 'border-[#37f5a0] bg-[#37f5a0] font-semibold text-[#050b0a]'
                    : 'border-[#20302b] bg-[#13201c] text-[#b3c2ba] hover:border-[#eaf3ee] hover:text-[#eaf3ee]'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {activeTab === 'support' && <SupportPanel />}
      {activeTab === 'legal' && <LegalPanel />}
      {activeTab === 'privacy' && <PrivacyPanel />}
      {activeTab === 'terms' && <TermsPanel />}

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-[2px] border border-[#20302b] bg-[#0c1513] px-5 py-3.5 text-xs text-[#86958d]">
        <span>
          Customer-production status remains <code className="font-mono text-[#f59e0b]">OPEN</code>{' '}
          · Contact{' '}
          <a
            href="mailto:hello@cascompass.ai"
            className="text-[#37f5a0] underline-offset-2 hover:underline"
          >
            hello@cascompass.ai
          </a>
        </span>
        <nav className="flex flex-wrap gap-4 font-mono text-[11px] uppercase tracking-[0.12em]">
          {TABS.map((tab) => (
            <Link
              key={tab.id}
              to={tab.to}
              className="text-[#b3c2ba] transition-colors hover:text-[#37f5a0]"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  );
}

export default SupportLegalPage;
