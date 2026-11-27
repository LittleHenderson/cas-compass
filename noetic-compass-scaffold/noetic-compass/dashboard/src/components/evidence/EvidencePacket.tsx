/**
 * EvidencePacket — slide-in drawer that renders a CAS Evidence Packet.
 *
 * The drawer is the "show your work" surface. Each idea becomes an
 * inspectable object: input, CAS expression, output, copy/slot trace,
 * provenance, hashes, claim levels. Standalone-mountable — no Atlas /
 * Brain Map / SGGS coupling.
 *
 * Render contract (7 labeled sections, fixed order):
 *   1. Input
 *   2. CAS expression
 *   3. Output
 *   4. Copy / slot trace
 *   5. Provenance
 *   6. Hashes (with Verify Hashes action)
 *   7. Claim levels
 *
 * Layout:
 *   - Right-side slide-in drawer (~640px wide)
 *   - Backdrop dims the rest of the page (50% opacity)
 *   - Click backdrop or press Escape → close
 *   - Visual language matches Mode7LiveShell / CASBrainMap (slate-950 bg,
 *     cyan-300 accents, white/slate-100 body text)
 *
 * Plain Mode tone — no jargon, define technical terms inline.
 */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError } from '../../api/client';
import {
  fetchEvidencePacket,
  verifyEvidenceHashes,
  type EvidenceClaimLevel,
  type EvidenceClaimSupport,
  type EvidenceCopySlotEntry,
  type EvidencePacket as EvidencePacketData,
  type VerifyHashesResponse,
} from '../../lib/evidence_packet';

export interface EvidencePacketProps {
  traceId: string;
  open: boolean;
  onClose: () => void;
  /** Optional pre-fetched packet (skip the HTTP call) — useful for storybook + tests */
  initialPacket?: EvidencePacketData;
}

// ── Claim-level badge palette ─────────────────────────────────────────────

interface ClaimLevelStyle {
  label: string;
  icon: 'check' | 'warn';
  className: string;
}

const CLAIM_LEVEL_STYLES: Record<EvidenceClaimLevel, ClaimLevelStyle> = {
  cas_hard_trace: {
    label: 'CAS hard trace',
    icon: 'check',
    className:
      'bg-[#13201c] border border-[#37f5a0]/50 text-[#37f5a0]',
  },
  source_copy_evidence: {
    label: 'Source copy evidence',
    icon: 'check',
    className:
      'bg-[#13201c] border border-[#37f5a0]/35 text-[#37f5a0]',
  },
  derived_trace: {
    label: 'Derived trace',
    icon: 'check',
    className: 'bg-[#13201c] border border-[#37f5a0]/25 text-[#eaf3ee]',
  },
  neural_attribution_estimate: {
    label: 'Neural attribution (estimate)',
    icon: 'warn',
    className: 'bg-[#13201c] border border-[#f59e0b]/50 text-[#f59e0b]',
  },
};

interface ClaimSupportStyle {
  label: string;
  className: string;
}

const CLAIM_SUPPORT_STYLES: Record<EvidenceClaimSupport, ClaimSupportStyle> = {
  supported: {
    label: 'Support: yes',
    className:
      'bg-[#13201c] border border-[#37f5a0]/50 text-[#37f5a0]',
  },
  partially_supported: {
    label: 'Support: partial',
    className: 'bg-[#13201c] border border-[#37f5a0]/25 text-[#eaf3ee]',
  },
  unsupported: {
    label: 'Support: no',
    className: 'bg-[#13201c] border border-[#f59e0b]/50 text-[#f59e0b]',
  },
  contradicted: {
    label: 'Contradicted',
    className: 'bg-[#13201c] border border-[#ff7b72]/50 text-[#ff7b72]',
  },
  not_applicable: {
    label: 'Support: not applicable',
    className: 'bg-[#13201c] border border-[#20302b] text-[#86958d]',
  },
  unknown: {
    label: 'Support: unknown',
    className: 'bg-[#13201c] border border-[#20302b] text-[#86958d]',
  },
};

// ── 5-step reviewer playbook (used when SPEC is not available) ────────────

const REVIEWER_PLAYBOOK: ReadonlyArray<{ step: string; detail: string }> = [
  {
    step: '1. Copy the trace ID.',
    detail:
      'Use the trace ID at the top of this drawer to find the matching JSON record on disk.',
  },
  {
    step: '2. Locate the evidence JSON.',
    detail:
      "Search for the trace ID in the model's run output. Every reply leaves a JSON record behind.",
  },
  {
    step: '3. Re-run the command.',
    detail:
      'Copy the run command from Provenance and run it locally. The reply should reproduce.',
  },
  {
    step: '4. SHA-256 the weights.',
    detail:
      'Hash the weights file at the path in Hashes. If the number does not match, the model changed.',
  },
  {
    step: '5. Read the evaluator report.',
    detail:
      'Open the evaluator report from the same run. Compare its numbers to the claim levels here.',
  },
];

// ── Headline blockquote ───────────────────────────────────────────────────

const HEADLINE_BLOCKQUOTE =
  'CAS does not just show an answer. It turns each idea into an inspectable object: meaning, structure, origin, and model evidence.';

// ── Small UI primitives ───────────────────────────────────────────────────

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path d="M2.5 6.5L5 9L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WarnIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 2L11 10H1L6 2Z" strokeLinejoin="round" />
      <path d="M6 5.5V7" strokeLinecap="round" />
      <circle cx="6" cy="8.75" r="0.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CrossIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 3L9 9M9 3L3 9" strokeLinecap="round" />
    </svg>
  );
}

function ClaimLevelBadge({ level }: { level: EvidenceClaimLevel }) {
  const style = CLAIM_LEVEL_STYLES[level];
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 font-mono text-[10px] font-medium',
        style.className,
      ].join(' ')}
      data-testid={`claim-badge-${level}`}
    >
      {style.icon === 'check' ? <CheckIcon /> : <WarnIcon />}
      <span>{style.label}</span>
    </span>
  );
}

function ClaimSupportBadge({
  status = 'unknown',
}: {
  status?: EvidenceClaimSupport;
}) {
  const style = CLAIM_SUPPORT_STYLES[status] ?? CLAIM_SUPPORT_STYLES.unknown;
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-[2px] px-2 py-0.5 font-mono text-[10px] font-medium',
        style.className,
      ].join(' ')}
      data-testid={`claim-support-${status}`}
      title="Claim support says whether the answer backs this claim up. It is separate from evidence type."
    >
      <span>{style.label}</span>
    </span>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-[#20302b] px-5 py-4">
      <h3 className="font-['Space_Grotesk',sans-serif] text-sm font-semibold text-[#eaf3ee]">{title}</h3>
      <p className="mt-0.5 text-[11px] italic text-[#86958d]">{subtitle}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-[2px] bg-[#13201c] border border-[#20302b] px-2 py-0.5 font-mono text-[10px] text-[#b3c2ba]">
      {children}
    </span>
  );
}

function CopyableInline({
  value,
  label,
  className = '',
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      }
    } catch {
      // Best-effort copy; never throw to the user.
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }, [value]);
  return (
    <button
      type="button"
      onClick={onCopy}
      className={[
        'font-mono text-[11px] text-[#37f5a0] hover:text-[#eaf3ee] transition-colors text-left break-all',
        className,
      ].join(' ')}
      title={label ? `${label} — click to copy` : 'click to copy'}
      aria-label={label ? `Copy ${label}` : 'Copy'}
    >
      {value}
      {copied && (
        <span className="ml-2 font-mono text-[10px] text-[#37f5a0]">(copied)</span>
      )}
    </button>
  );
}

function MonoBlock({ children }: { children: ReactNode }) {
  return (
    <pre className="whitespace-pre-wrap break-words rounded-[2px] border border-[#20302b] bg-[#050b0a] p-3 font-mono text-[12px] text-[#eaf3ee]">
      {children}
    </pre>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Truncate-or-placeholder helpers for SHA-256 hashes. Some fixtures (and
 * back-compat packets that pre-date the on-disk verifier) may have null /
 * undefined hash fields when the artifact has not been hashed on this host
 * yet. We render an explicit "unavailable on this host" placeholder instead
 * of crashing.
 */
const UNAVAILABLE_ON_HOST = 'unavailable on this host';

function firstEight(sha: string | null | undefined): string {
  if (!sha) return UNAVAILABLE_ON_HOST;
  return sha.slice(0, 8);
}

function firstSixteen(sha: string | null | undefined): string {
  if (!sha) return UNAVAILABLE_ON_HOST;
  return sha.slice(0, 16);
}

function downloadAsJson(packet: EvidencePacketData) {
  // Two fallbacks: real browser + jsdom (no URL.createObjectURL). Tests mock
  // URL.createObjectURL and verify a.click() fires.
  const blob = new Blob([JSON.stringify(packet, null, 2)], {
    type: 'application/json',
  });
  let href = '';
  try {
    href = URL.createObjectURL(blob);
  } catch {
    href = '';
  }
  const a = document.createElement('a');
  a.href = href;
  a.download = `${packet.trace_id}.evidence.json`;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (href) {
    try {
      URL.revokeObjectURL(href);
    } catch {
      // ignore
    }
  }
}

// ── Component ─────────────────────────────────────────────────────────────

export function EvidencePacket(props: EvidencePacketProps) {
  const { traceId, open, onClose, initialPacket } = props;

  const [packet, setPacket] = useState<EvidencePacketData | null>(
    initialPacket ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyHashesResponse | null>(
    null,
  );
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [showPlaybook, setShowPlaybook] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // When `initialPacket` changes (e.g. parent reloads), sync it in.
  useEffect(() => {
    if (initialPacket) {
      setPacket(initialPacket);
      setError(null);
    }
  }, [initialPacket]);

  // Fetch on open if no initialPacket.
  useEffect(() => {
    if (!open) return;
    if (initialPacket) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchEvidencePacket(traceId)
      .then((p) => {
        if (cancelled) return;
        setPacket(p);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const detail =
          err instanceof ApiError
            ? err.detail
            : err instanceof Error
              ? err.message
              : String(err);
        setError(detail || 'Failed to load evidence packet.');
        setPacket(null);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, traceId, initialPacket, retryTick]);

  // Reset transient state when the drawer is closed.
  useEffect(() => {
    if (!open) {
      setVerifyResult(null);
      setVerifyError(null);
      setVerifying(false);
      setShowPlaybook(false);
      setShowConfig(false);
    }
  }, [open]);

  // Escape-to-close.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const onVerifyClick = useCallback(async () => {
    setVerifying(true);
    setVerifyError(null);
    setVerifyResult(null);
    try {
      const res = await verifyEvidenceHashes(traceId);
      setVerifyResult(res);
    } catch (err) {
      const detail =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? err.message
            : String(err);
      setVerifyError(detail || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  }, [traceId]);

  const onRetry = useCallback(() => {
    setRetryTick((t) => t + 1);
  }, []);

  const onExportJson = useCallback(() => {
    if (!packet) return;
    downloadAsJson(packet);
  }, [packet]);

  const verifyBanner = useMemo(() => {
    if (!verifyResult) return null;
    const { overall, checks } = verifyResult;
    const matchCount = checks.filter((c) => c.match).length;
    const total = checks.length;
    if (overall === 'all_match') {
      return {
        tone: 'emerald' as const,
        text: 'All artifact hashes verified.',
      };
    }
    if (overall === 'partial_mismatch') {
      return {
        tone: 'rose' as const,
        text: `Mismatch detected: ${total - matchCount} of ${total} artifacts changed. See per-row notes.`,
      };
    }
    return {
      tone: 'amber' as const,
      text: "Some artifacts couldn't be located locally — see notes.",
    };
  }, [verifyResult]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="presentation"
      data-testid="evidence-packet-root"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#050b0a]/75"
        onClick={onClose}
        role="presentation"
        data-testid="evidence-packet-backdrop"
      />

      {/* Drawer */}
      <div
        className="absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col border-l border-[#20302b] bg-[#0c1513] shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Evidence Packet"
        onClick={(e) => e.stopPropagation()}
      >
        <DrawerHeader
          traceId={traceId}
          onClose={onClose}
          generatedAt={packet?.generated_at}
        />

        <div className="flex-1 overflow-y-auto">
          {loading && !packet && <SkeletonBody />}
          {!loading && error && (
            <ErrorPanel message={error} onRetry={onRetry} />
          )}
          {packet && (
            <PacketBody
              packet={packet}
              verifyResult={verifyResult}
              verifyBanner={verifyBanner}
              verifyError={verifyError}
              verifying={verifying}
              onVerifyClick={onVerifyClick}
              showConfig={showConfig}
              setShowConfig={setShowConfig}
            />
          )}
        </div>

        <DrawerFooter
          packet={packet}
          showPlaybook={showPlaybook}
          setShowPlaybook={setShowPlaybook}
          onExportJson={onExportJson}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

// ── Drawer header ─────────────────────────────────────────────────────────

function DrawerHeader({
  traceId,
  onClose,
  generatedAt,
}: {
  traceId: string;
  onClose: () => void;
  generatedAt?: string;
}) {
  return (
    <div className="border-b border-[#20302b] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#37f5a0]">
            Evidence Packet
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CopyableInline value={traceId} label="trace id" />
          </div>
          {generatedAt && (
            <p className="mt-1 font-mono text-[10px] text-[#86958d]">
              Generated {generatedAt}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[2px] border border-[#20302b] p-1 text-[#86958d] hover:border-[#eaf3ee] hover:text-[#eaf3ee] transition-colors"
          aria-label="Close"
        >
          <CrossIcon className="h-4 w-4" />
        </button>
      </div>

      {traceId.startsWith('dev_') && (
        <div
          className="mt-3 rounded-[2px] border border-dashed border-[#f59e0b]/70 bg-[#13201c] px-3 py-2 text-[11px] text-[#eaf3ee]"
          data-testid="evidence-packet-example-banner"
          role="note"
        >
          <span className="font-semibold">Example packet — not this selected thought yet.</span>{' '}
          This is a developer fixture so reviewers can audit the surface. Real
          per-thought packets arrive once chat REPL / Atlas surfaces hand off
          live trace IDs.
        </div>
      )}

      <blockquote className="mt-4 rounded-[2px] border-l-2 border-[#37f5a0] bg-[#13201c] px-3 py-2 text-[12px] italic text-[#eaf3ee]">
        &ldquo;{HEADLINE_BLOCKQUOTE}&rdquo;
      </blockquote>
    </div>
  );
}

// ── Skeleton + error ──────────────────────────────────────────────────────

function SkeletonBody() {
  return (
    <div className="space-y-4 px-5 py-4" data-testid="evidence-packet-skeleton">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded-[2px] bg-[#13201c]" />
          <div className="h-16 w-full animate-pulse rounded-[2px] bg-[#13201c]" />
        </div>
      ))}
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="m-5 rounded-[2px] border border-[#ff7b72]/50 bg-[#13201c] p-4 text-sm text-[#eaf3ee]"
      data-testid="evidence-packet-error"
    >
      <p className="font-semibold">Could not load evidence packet</p>
      <p className="mt-1 text-[12px] text-[#ff7b72]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-[2px] border border-[#ff7b72] bg-transparent px-3 py-1 font-mono text-[11px] uppercase text-[#ff7b72] hover:bg-[#ff7b72] hover:text-[#050b0a] transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ── Body ──────────────────────────────────────────────────────────────────

interface VerifyBannerShape {
  tone: 'emerald' | 'rose' | 'amber';
  text: string;
}

function PacketBody({
  packet,
  verifyResult,
  verifyBanner,
  verifyError,
  verifying,
  onVerifyClick,
  showConfig,
  setShowConfig,
}: {
  packet: EvidencePacketData;
  verifyResult: VerifyHashesResponse | null;
  verifyBanner: VerifyBannerShape | null;
  verifyError: string | null;
  verifying: boolean;
  onVerifyClick: () => void;
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
}) {
  return (
    <div>
      {/* 1. Input */}
      <Section
        title="Input"
        subtitle="The exact text the user submitted. No editing, no paraphrase."
      >
        <MonoBlock>{packet.input.text}</MonoBlock>
        {(packet.input.user_id || packet.input.session_id) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {packet.input.user_id && <Chip>user: {packet.input.user_id}</Chip>}
            {packet.input.session_id && (
              <Chip>session: {packet.input.session_id}</Chip>
            )}
          </div>
        )}
      </Section>

      {/* 2. CAS expression */}
      <Section
        title="CAS expression"
        subtitle="The structured form the model used. Validated by api/notation/compiler.py."
      >
        <CasExpressionView packet={packet} />
      </Section>

      {/* 3. Output */}
      <Section
        title="Output"
        subtitle="The model's full reply, generated from the CAS expression and input."
      >
        <div className="whitespace-pre-wrap rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 text-[13px] text-[#eaf3ee]">
          {packet.output.text}
        </div>
        {(packet.output.n_tokens != null ||
          packet.output.max_new_tokens != null) && (
          <div className="mt-2 flex flex-wrap gap-2">
            {packet.output.n_tokens != null && (
              <Chip>tokens: {packet.output.n_tokens}</Chip>
            )}
            {packet.output.max_new_tokens != null && (
              <Chip>max_new_tokens: {packet.output.max_new_tokens}</Chip>
            )}
          </div>
        )}
      </Section>

      {/* 4. Copy / slot trace */}
      <Section
        title="Copy / slot trace"
        subtitle="Which named identifiers survived the trip from input to output. Backed by pointer evidence."
      >
        <CopySlotTraceView entries={packet.copy_slot_trace} />
      </Section>

      {/* 5. Provenance */}
      <Section
        title="Provenance"
        subtitle="Every step is logged with its checkpoint, code commit, and config."
      >
        <ProvenanceView
          packet={packet}
          showConfig={showConfig}
          setShowConfig={setShowConfig}
        />
      </Section>

      {/* 6. Hashes */}
      <Section
        title="Hashes"
        subtitle="Compare these to the on-disk files yourself. Mismatch means something changed."
      >
        {verifyBanner && (
          <div
            className={[
              'mb-3 rounded-[2px] border px-3 py-2 text-[12px]',
              verifyBanner.tone === 'emerald'
                ? 'border-[#37f5a0]/50 bg-[#13201c] text-[#37f5a0]'
                : verifyBanner.tone === 'rose'
                  ? 'border-[#ff7b72]/50 bg-[#13201c] text-[#ff7b72]'
                  : 'border-dashed border-[#f59e0b]/60 bg-[#13201c] text-[#f59e0b]',
            ].join(' ')}
            data-testid="evidence-packet-verify-banner"
          >
            {verifyBanner.text}
          </div>
        )}
        {verifyError && !verifyBanner && (
          <div className="mb-3 rounded-[2px] border border-[#ff7b72]/50 bg-[#13201c] px-3 py-2 text-[12px] text-[#ff7b72]">
            Verification request failed: {verifyError}
          </div>
        )}
        <HashesTable
          packet={packet}
          verifyResult={verifyResult}
        />
        <button
          type="button"
          onClick={onVerifyClick}
          disabled={verifying}
          className={[
            'mt-3 rounded-[2px] px-3.5 py-1.5 text-[12px] font-semibold transition-opacity',
            verifying
              ? 'border border-[#20302b] bg-[#13201c] text-[#86958d] cursor-not-allowed'
              : 'bg-[#37f5a0] text-[#050b0a] hover:opacity-90',
          ].join(' ')}
        >
          {verifying ? 'Verifying…' : 'Verify Hashes'}
        </button>
      </Section>

      {/* 7. Claim levels (with caveats above if present) */}
      <Section
        title="Evidence type & claim support"
        subtitle="Evidence type says how CAS traced it. Claim support says whether the answer backed it up."
      >
        {packet.caveats && packet.caveats.length > 0 && (
          <div
            className="mb-3 rounded-[2px] border border-dashed border-[#f59e0b]/70 bg-[#13201c] p-3 text-[12px] text-[#eaf3ee]"
            data-testid="evidence-packet-caveats"
          >
            <p className="font-semibold">⚠ Caveats</p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5">
              {packet.caveats.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        <p
          className="mb-3 rounded-[2px] border border-[#20302b] bg-[#13201c] px-3 py-2 text-[12px] text-[#b3c2ba]"
          data-testid="evidence-confidence-separation-note"
        >
          Evidence type and claim support are different. CAS may clearly
          track that a claim was made while still marking the claim itself as
          unsupported.
        </p>
        <ClaimLevelsList claims={packet.claim_levels} />
      </Section>
    </div>
  );
}

// ── CAS expression view ───────────────────────────────────────────────────

function CasExpressionView({ packet }: { packet: EvidencePacketData }) {
  if (!packet.cas_expression) {
    return (
      <p className="text-[12px] italic text-[#b3c2ba]">
        This thought did not produce a CAS expression. See claim levels below
        for why.
      </p>
    );
  }
  const expr = packet.cas_expression;
  return (
    <div>
      <MonoBlock>{expr.text}</MonoBlock>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {expr.compiler_valid ? (
          <span
            className="inline-flex items-center gap-1 rounded-[2px] bg-[#13201c] border border-[#37f5a0]/50 px-2 py-0.5 font-mono text-[10px] text-[#37f5a0]"
            data-testid="cas-compiler-valid"
          >
            <CheckIcon />
            Compiler valid
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1 rounded-[2px] bg-[#13201c] border border-[#ff7b72]/50 px-2 py-0.5 font-mono text-[10px] text-[#ff7b72]"
            data-testid="cas-compiler-invalid"
          >
            <CrossIcon />
            Compiler error
            {expr.compiler_error ? `: ${expr.compiler_error}` : ''}
          </span>
        )}
        {expr.grammar_category && <Chip>{expr.grammar_category}</Chip>}
      </div>
    </div>
  );
}

// ── Copy / slot trace view ────────────────────────────────────────────────

function CopySlotTraceView({
  entries,
}: {
  entries?: EvidenceCopySlotEntry[];
}) {
  if (!entries || entries.length === 0) {
    return (
      <p className="text-[12px] italic text-[#b3c2ba]">
        No copy slot trace recorded for this thought.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-[2px] border border-[#20302b] bg-[#050b0a]">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-[#13201c] text-left font-mono text-[#86958d]">
            <th className="px-2 py-1.5 font-medium">Role</th>
            <th className="px-2 py-1.5 font-medium">Name</th>
            <th className="px-2 py-1.5 font-medium">Copied</th>
            <th className="px-2 py-1.5 font-medium">Src idx</th>
            <th className="px-2 py-1.5 font-medium">Tgt idx</th>
            <th className="px-2 py-1.5 font-medium">Evidence type</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr
              key={i}
              className="border-t border-[#20302b] text-[#eaf3ee]"
            >
              <td className="px-2 py-1.5 font-mono text-[10px] text-[#b3c2ba]">
                {e.role}
              </td>
              <td className="px-2 py-1.5 font-mono">{e.name}</td>
              <td className="px-2 py-1.5">
                {e.copied ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[#37f5a0]">
                    <CheckIcon /> yes
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 font-mono text-[#f59e0b]">
                    <span className="inline-block h-1.5 w-1.5 rounded-[1px] bg-[#f59e0b]" />
                    no
                  </span>
                )}
              </td>
              <td className="px-2 py-1.5 font-mono text-[#b3c2ba]">
                {e.source_token_index ?? '—'}
              </td>
              <td className="px-2 py-1.5 font-mono text-[#b3c2ba]">
                {e.target_token_index ?? '—'}
              </td>
              <td className="px-2 py-1.5">
                <ClaimLevelBadge level={e.claim_level} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Provenance view ───────────────────────────────────────────────────────

function ProvenanceView({
  packet,
  showConfig,
  setShowConfig,
}: {
  packet: EvidencePacketData;
  showConfig: boolean;
  setShowConfig: (v: boolean) => void;
}) {
  const p = packet.provenance;
  return (
    <dl className="space-y-2 text-[12px]">
      <div className="flex gap-2">
        <dt className="w-32 shrink-0 text-[#86958d]">Model checkpoint</dt>
        <dd className="min-w-0 flex-1 text-[#eaf3ee]">
          {p.checkpoint_label && (
            <span className="font-medium">{p.checkpoint_label}</span>
          )}
          {p.checkpoint_label && ' '}
          <span className="font-mono text-[11px] text-[#b3c2ba]">
            ({p.model_checkpoint_id})
          </span>
        </dd>
      </div>
      <div className="flex gap-2">
        <dt className="w-32 shrink-0 text-[#86958d]">Code commit</dt>
        <dd className="min-w-0 flex-1 text-[#eaf3ee]">
          <span className="font-mono text-[11px] text-[#37f5a0]">
            {firstEight(p.code_commit_sha)}
          </span>
          {p.code_commit_summary && (
            <>
              {' — '}
              <span className="text-[#b3c2ba]">{p.code_commit_summary}</span>
            </>
          )}
        </dd>
      </div>
      {p.run_command && (
        <div className="flex flex-col gap-1">
          <dt className="text-[#86958d]">Run command</dt>
          <dd>
            <MonoBlock>{p.run_command}</MonoBlock>
          </dd>
        </div>
      )}
      {p.config_snapshot && (
        <div className="flex flex-col gap-1">
          <dt>
            <button
              type="button"
              onClick={() => setShowConfig(!showConfig)}
              className="font-mono text-[11px] text-[#37f5a0] hover:underline transition-colors"
              aria-expanded={showConfig}
            >
              {showConfig ? '▼' : '▶'} Config snapshot
            </button>
          </dt>
          {showConfig && (
            <dd>
              <MonoBlock>
                {JSON.stringify(p.config_snapshot, null, 2)}
              </MonoBlock>
            </dd>
          )}
        </div>
      )}
    </dl>
  );
}

// ── Hashes table ──────────────────────────────────────────────────────────

interface HashRow {
  /** Lowercase identifier matching the backend `artifact` field on /verify responses. */
  id: string;
  /** Human-readable label rendered in the table. */
  label: string;
  sha: string | null;
  path?: string;
}

function buildHashRows(packet: EvidencePacketData): HashRow[] {
  const rows: HashRow[] = [];
  rows.push({
    id: 'weights',
    label: 'Weights',
    sha: packet.hashes.weights_sha ?? null,
    path: packet.hashes.on_disk_paths.weights_path,
  });
  rows.push({
    id: 'tokenizer',
    label: 'Tokenizer',
    sha: packet.hashes.tokenizer_hash ?? null,
    path: packet.hashes.on_disk_paths.tokenizer_path,
  });
  if (packet.hashes.english_bpe_hash) {
    rows.push({
      id: 'english_bpe',
      label: 'English BPE',
      sha: packet.hashes.english_bpe_hash,
      path: packet.hashes.on_disk_paths.english_bpe_path,
    });
  }
  if (packet.hashes.corpus_sha256) {
    rows.push({
      id: 'corpus',
      label: 'Corpus',
      sha: packet.hashes.corpus_sha256,
      path: packet.hashes.on_disk_paths.corpus_path,
    });
  }
  return rows;
}

function HashesTable({
  packet,
  verifyResult,
}: {
  packet: EvidencePacketData;
  verifyResult: VerifyHashesResponse | null;
}) {
  const rows = useMemo(() => buildHashRows(packet), [packet]);
  const checkByArtifact = useMemo(() => {
    const map = new Map<
      string,
      VerifyHashesResponse['checks'][number]
    >();
    if (verifyResult) {
      for (const c of verifyResult.checks) {
        map.set(c.artifact, c);
      }
    }
    return map;
  }, [verifyResult]);

  return (
    <div className="overflow-x-auto rounded-[2px] border border-[#20302b] bg-[#050b0a]">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="bg-[#13201c] text-left font-mono text-[#86958d]">
            <th className="px-2 py-1.5 font-medium">Artifact</th>
            <th className="px-2 py-1.5 font-medium">SHA-256</th>
            <th className="px-2 py-1.5 font-medium">On-disk path</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const check = checkByArtifact.get(r.id);
            return (
              <tr
                key={r.id}
                className="border-t border-[#20302b] align-top text-[#eaf3ee]"
              >
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span>{r.label}</span>
                    {check && !check.match && (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-[2px] bg-[#13201c] border border-[#ff7b72]/50 px-1.5 py-0.5 font-mono text-[9px] text-[#ff7b72]"
                        title={check.notes ?? 'Hash mismatch'}
                      >
                        <CrossIcon />
                        mismatch
                      </span>
                    )}
                    {check && check.match && (
                      <span className="inline-flex items-center gap-0.5 rounded-[2px] bg-[#13201c] border border-[#37f5a0]/50 px-1.5 py-0.5 font-mono text-[9px] text-[#37f5a0]">
                        <CheckIcon />
                        match
                      </span>
                    )}
                  </div>
                  {check?.notes && (
                    <p className="mt-0.5 text-[10px] text-[#b3c2ba]">
                      {check.notes}
                    </p>
                  )}
                </td>
                <td
                  className="px-2 py-1.5 font-mono text-[10px] text-[#b3c2ba]"
                  title={r.sha ?? UNAVAILABLE_ON_HOST}
                >
                  {r.sha ? (
                    <>
                      {firstSixteen(r.sha)}
                      <span className="text-[#86958d]">…</span>
                    </>
                  ) : (
                    <span className="italic text-[#86958d]">
                      {UNAVAILABLE_ON_HOST}
                    </span>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  {r.path ? (
                    <CopyableInline value={r.path} label="path" />
                  ) : (
                    <span className="text-[10px] text-[#86958d]">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Claim levels list ─────────────────────────────────────────────────────

function ClaimLevelsList({
  claims,
}: {
  claims: EvidencePacketData['claim_levels'];
}) {
  if (!claims || claims.length === 0) {
    return (
      <p className="text-[12px] italic text-[#b3c2ba]">
        No claim-level annotations on this packet.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {claims.map((c, i) => (
        <li
          key={i}
          className="rounded-[2px] border border-[#20302b] bg-[#13201c] p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="flex-1 text-[12px] text-[#eaf3ee]">{c.claim}</p>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <ClaimLevelBadge level={c.level} />
              <ClaimSupportBadge status={c.support_status ?? 'unknown'} />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-[#b3c2ba]">{c.rationale}</p>
          {c.support_rationale && (
            <p className="mt-1 text-[11px] text-[#b3c2ba]">
              Claim support: {c.support_rationale}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────

function DrawerFooter({
  packet,
  showPlaybook,
  setShowPlaybook,
  onExportJson,
  onClose,
}: {
  packet: EvidencePacketData | null;
  showPlaybook: boolean;
  setShowPlaybook: (v: boolean) => void;
  onExportJson: () => void;
  onClose: () => void;
}) {
  return (
    <div className="border-t border-[#20302b] bg-[#050b0a] px-5 py-3">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setShowPlaybook(!showPlaybook)}
          className="rounded-[2px] border border-[#eaf3ee] px-3 py-1.5 text-[12px] font-medium text-[#eaf3ee] hover:border-[#37f5a0] hover:text-[#37f5a0] transition-colors"
          aria-expanded={showPlaybook}
        >
          {showPlaybook ? 'Hide' : 'How to audit this'}
        </button>
        <button
          type="button"
          onClick={onExportJson}
          disabled={!packet}
          className={[
            'rounded-[2px] px-3.5 py-1.5 text-[12px] font-semibold transition-opacity',
            !packet
              ? 'border border-[#20302b] bg-[#13201c] text-[#86958d] cursor-not-allowed'
              : 'bg-[#37f5a0] text-[#050b0a] hover:opacity-90',
          ].join(' ')}
        >
          Export JSON
        </button>
        <button
          type="button"
          onClick={onClose}
          className="rounded-[2px] border border-[#eaf3ee] px-3 py-1.5 text-[12px] font-medium text-[#eaf3ee] hover:border-[#37f5a0] hover:text-[#37f5a0] transition-colors"
        >
          Close
        </button>
      </div>
      {showPlaybook && (
        <div
          className="mt-3 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3 text-[12px] text-[#eaf3ee]"
          data-testid="evidence-packet-playbook"
        >
          <p className="text-[11px] uppercase tracking-wide text-[#b3c2ba]">
            How to audit this
          </p>
          <ol className="mt-2 space-y-1.5">
            {REVIEWER_PLAYBOOK.map((row, i) => (
              <li key={i}>
                <p className="font-semibold text-[#eaf3ee]">{row.step}</p>
                <p className="text-[#b3c2ba]">{row.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

// Re-export for convenience.
export type { EvidencePacketData };

// Default export.
export default EvidencePacket;
