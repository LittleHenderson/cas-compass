import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { loginWithCredentials } from '../api/auth';
import { CasLabBrandMark } from '../components/layout/Header';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [apiCredential, setApiCredential] = useState('');
  const [runtimeMintSecret, setRuntimeMintSecret] = useState('');
  const [showLegacyCredential, setShowLegacyCredential] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleConnect() {
    const name = username.trim();
    if (!name) return;
    setError('');
    setLoading(true);

    try {
      await loginWithCredentials({
        username: name,
        apiCredential: apiCredential.trim() || undefined,
        runtimeMintSecret: runtimeMintSecret.trim() || undefined,
      });
      // Clear raw credentials from memory immediately after token issuance.
      setApiCredential('');
      setRuntimeMintSecret('');
      navigate('/scenarios');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-[#050b0a] text-[#eaf3ee]">
      {/* CAS Lab top utility bar */}
      <div className="caslab-bar flex shrink-0 items-center justify-between px-4 py-2 sm:px-6 safe-top">
        <a
          href="https://www.caslabai.com/#research"
          className="inline-flex items-center gap-1.5 text-[#b3c2ba] transition-colors hover:text-[#37f5a0]"
        >
          <span aria-hidden="true">←</span>
          <span>CAS Lab</span>
        </a>
        <span className="truncate text-[#86958d]">CAS Compass · CAS Lab workbench</span>
      </div>

      {/* Main centered sign-in panel */}
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-[2px] border border-[#eaf3ee] bg-[#0c1513] p-7 sm:p-8">
          {/* Lockup + stage badge */}
          <div className="flex items-center justify-between gap-3 border-b border-[#20302b] pb-5">
            <div className="inline-flex items-center gap-2">
              <CasLabBrandMark size={28} />
              <span className="font-['Space_Grotesk',sans-serif] text-base font-bold tracking-tight text-[#eaf3ee]">
                CAS
              </span>
              <span
                className="inline-flex items-center rounded-[2px] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.06em]"
                style={{ backgroundColor: '#8b9096', color: '#050b0a' }}
              >
                Compass
              </span>
            </div>

            <span className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#f59e0b]/45 bg-[#f59e0b]/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#f59e0b]">
              <span aria-hidden="true">◐</span>
              Prototype
            </span>
          </div>

          <div className="mt-6">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#37f5a0]">
              CAS LAB · EVALUATION WORKBENCH
            </p>
            <h1 className="mt-2 font-['Space_Grotesk',sans-serif] text-2xl font-bold tracking-[-0.025em] text-[#eaf3ee]">
              Sign in to CAS Compass
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[#b3c2ba]">
              Sign in with your account email/username and issued API credential. Credentials are
              sent directly to the API over TLS and are never persisted in browser storage.
            </p>
          </div>

          {/* Honest boundary note */}
          <div className="mt-5 rounded-[2px] border border-[#20302b] bg-[#13201c] p-3.5 text-xs leading-relaxed text-[#b3c2ba]">
            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#f59e0b]">
              Research Boundary
            </p>
            <p className="mt-1">
              Customer-production status: OPEN. Research verdicts do not establish
              customer-production ACCEPT or compliance certification.
            </p>
          </div>

          <form
            className="mt-6 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleConnect();
            }}
          >
            <div>
              <label
                htmlFor="cas-username"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[#86958d]"
              >
                Account Email or Username
              </label>
              <input
                id="cas-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="you@organization.com"
                autoComplete="username"
                className="w-full rounded-[2px] border-[1.5px] border-[#eaf3ee] bg-[#050b0a] px-3.5 py-3 text-sm text-[#eaf3ee] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="cas-api-credential"
                className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[#86958d]"
              >
                Account Credential (casak_…)
              </label>
              <input
                id="cas-api-credential"
                type="password"
                value={apiCredential}
                onChange={(e) => setApiCredential(e.target.value)}
                placeholder="casak_…"
                autoComplete="current-password"
                className="w-full rounded-[2px] border-[1.5px] border-[#20302b] bg-[#050b0a] px-3.5 py-3 text-sm text-[#eaf3ee] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none"
              />
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowLegacyCredential((prev) => !prev)}
                className="font-mono text-[11px] text-[#86958d] underline-offset-2 hover:text-[#b3c2ba] hover:underline"
              >
                {showLegacyCredential
                  ? 'Hide runtime mint credential'
                  : 'Use runtime mint credential (dev / legacy lane)'}
              </button>
              {showLegacyCredential && (
                <div className="mt-2">
                  <label
                    htmlFor="cas-runtime-mint-secret"
                    className="mb-1.5 block font-mono text-[11px] uppercase tracking-[0.08em] text-[#86958d]"
                  >
                    Runtime Mint Credential (in-memory only)
                  </label>
                  <input
                    id="cas-runtime-mint-secret"
                    type="password"
                    value={runtimeMintSecret}
                    onChange={(e) => setRuntimeMintSecret(e.target.value)}
                    placeholder="Enter operator-supplied mint secret"
                    autoComplete="off"
                    className="w-full rounded-[2px] border-[1.5px] border-[#20302b] bg-[#050b0a] px-3.5 py-3 text-sm text-[#eaf3ee] placeholder-[#62706a] focus:border-[#37f5a0] focus:outline-none"
                  />
                </div>
              )}
            </div>

            {error && (
              <div
                role="alert"
                className="rounded-[2px] border border-[#ff7b72]/50 bg-[#ff7b72]/10 px-3 py-2 text-xs text-[#ff7b72]"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!username.trim() || loading}
              className="w-full min-h-[44px] rounded-[2px] bg-[#37f5a0] px-4 py-3 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#050b0a] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {loading ? 'Connecting...' : 'Sign in to Workbench'}
            </button>
          </form>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#20302b] px-4 py-4 text-center font-mono text-[11px] text-[#86958d]">
        <div className="flex flex-wrap items-center justify-center gap-4">
          <a
            href="https://www.caslabai.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#b3c2ba] hover:text-[#37f5a0]"
          >
            CAS Lab
          </a>
          <Link to="/support" className="hover:text-[#37f5a0]">Support</Link>
          <Link to="/legal" className="hover:text-[#37f5a0]">Legal</Link>
          <Link to="/privacy" className="hover:text-[#37f5a0]">Privacy</Link>
          <Link to="/terms" className="hover:text-[#37f5a0]">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
