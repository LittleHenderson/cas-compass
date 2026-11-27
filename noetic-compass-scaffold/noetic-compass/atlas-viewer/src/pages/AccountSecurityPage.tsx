import { useState, type CSSProperties } from 'react';
import { useAccountAuth } from '../auth/AccountAuthProvider';
import { GlassPanel } from '../components/ui/GlassPanel';
import { PageShell } from '../components/ui/PageShell';
import { generateAccountCredential } from '../lib/accountAuthApi';
import { ACCENT_AMBER, ACCENT_ERROR, ACCENT_TEAL, COLORS, FONT_DISPLAY, FONT_MONO } from '../lib/designTokens';

const eyebrowStyle: CSSProperties = {
  margin: '0 0 8px 0',
  fontFamily: FONT_MONO,
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: ACCENT_TEAL,
};

const textStyle: CSSProperties = {
  margin: '7px 0',
  color: COLORS.textSecondary,
  fontSize: 13.5,
  lineHeight: 1.5,
};

const dtStyle: CSSProperties = {
  fontFamily: FONT_MONO,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.8,
  color: COLORS.textMuted,
  alignSelf: 'center',
};

const buttonStyle = (primary = false, disabled = false): CSSProperties => ({
  minHeight: 38,
  padding: '8px 14px',
  borderRadius: 2,
  border: primary ? `1px solid ${ACCENT_TEAL}` : `1px solid ${COLORS.rule}`,
  background: primary ? ACCENT_TEAL : COLORS.stripe,
  color: primary ? COLORS.ground : COLORS.textPrimary,
  cursor: disabled ? 'not-allowed' : 'pointer',
  opacity: disabled ? 0.48 : 1,
  fontFamily: primary ? FONT_DISPLAY : FONT_MONO,
  fontSize: primary ? 13 : 11.5,
  fontWeight: 700,
  letterSpacing: primary ? 0.2 : 0.6,
  textTransform: primary ? undefined : 'uppercase',
});

function downloadCredential(credential: string): void {
  const blob = new Blob([
    'CAS Harness rotated customer account credential\n',
    `${credential}\n\n`,
    'This credential replaces the previous credential after rotation.\n',
  ], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'cas-harness-rotated-account-credential.txt';
  anchor.rel = 'noopener noreferrer';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export default function AccountSecurityPage(): JSX.Element {
  const auth = useAccountAuth();
  const [nextCredential, setNextCredential] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const generate = () => {
    setNextCredential(generateAccountCredential());
    setSaved(false);
    setError(null);
    setNotice('Save the new credential before rotating. It is held only in this page memory.');
  };

  const copy = async () => {
    if (!nextCredential) return;
    await navigator.clipboard.writeText(nextCredential);
    setNotice('New credential copied. Store it in your password manager or secrets vault.');
  };

  const rotate = async () => {
    if (!nextCredential || !saved) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await auth.rotateCredential(nextCredential);
      // Successful rotation revokes every account session. AuthGate sends the
      // user to sign-in, while the provider holds the new credential only in
      // memory long enough for the one-time save/sign-in handoff.
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Credential rotation failed.');
      setNotice(
        'Keep this generated credential visible. If the response was interrupted and your session is rejected, try signing in with this new value before requesting operator recovery.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell cardMaxWidth={680}>
      <GlassPanel intensity="regular" padding={24} ariaLabel="Account security">
        <p style={eyebrowStyle}>CAS Compass · Account Claims</p>
        <h1 style={{ margin: 0, fontFamily: FONT_DISPLAY, color: COLORS.textPrimary, fontSize: 26 }}>
          Account security
        </h1>
        <p style={textStyle}>
          Signed in as <strong style={{ color: COLORS.textPrimary }}>{auth.claims?.sub}</strong>. Tenant and role are taken from the
          server-signed session, never from an editable browser field.
        </p>
        <dl style={{
          display: 'grid',
          gridTemplateColumns: 'max-content 1fr',
          gap: '8px 16px',
          padding: 12,
          borderRadius: 2,
          border: `1px solid ${COLORS.rule}`,
          background: COLORS.stripe,
          ...textStyle,
        }}>
          <dt style={dtStyle}>Account</dt>
          <dd style={{ margin: 0, fontFamily: FONT_MONO, color: COLORS.textPrimary }}>{auth.claims?.account_id}</dd>
          <dt style={dtStyle}>Tenant</dt>
          <dd style={{ margin: 0, fontFamily: FONT_MONO, color: COLORS.textPrimary }}>{auth.claims?.tenant_id}</dd>
          <dt style={dtStyle}>Role</dt>
          <dd style={{ margin: 0, fontFamily: FONT_MONO, color: ACCENT_TEAL }}>{auth.claims?.role}</dd>
        </dl>

        <section style={{ marginTop: 24, paddingTop: 18, borderTop: `1px solid ${COLORS.rule}` }}>
          <h2 style={{ margin: 0, fontFamily: FONT_DISPLAY, color: COLORS.textPrimary, fontSize: 18 }}>
            Rotate my credential
          </h2>
          <p style={textStyle}>
            Rotation replaces the current credential and revokes every existing session for this
            account. CAS Harness stores only a verifier, so the new credential cannot be recovered.
          </p>
          {!nextCredential ? (
            <button type="button" style={buttonStyle(true)} onClick={generate}>
              Generate replacement credential
            </button>
          ) : (
            <div>
              <code style={{
                display: 'block',
                padding: 12,
                borderRadius: 2,
                border: `1px dashed ${ACCENT_AMBER}`,
                background: COLORS.stripe,
                color: COLORS.textPrimary,
                fontFamily: FONT_MONO,
                fontSize: 11.5,
                overflowWrap: 'anywhere',
                userSelect: 'all',
              }}>
                {nextCredential}
              </code>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <button type="button" style={buttonStyle()} onClick={() => void copy()}>Copy credential</button>
                <button type="button" style={buttonStyle()} onClick={() => downloadCredential(nextCredential)}>Download credential</button>
                <button type="button" style={buttonStyle()} onClick={generate}>Generate a different value</button>
              </div>
              <label style={{ ...textStyle, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <input type="checkbox" checked={saved} onChange={(event) => setSaved(event.target.checked)} />
                I securely saved this replacement credential and understand all sessions will be revoked.
              </label>
              <button type="button" disabled={busy || !saved} style={buttonStyle(true, busy || !saved)} onClick={() => void rotate()}>
                {busy ? 'Rotating and revoking sessions...' : 'Rotate credential and sign out'}
              </button>
            </div>
          )}
          {error ? <p role="alert" style={{ ...textStyle, color: ACCENT_ERROR }}>{error}</p> : null}
          {notice ? <p role="status" style={textStyle}>{notice}</p> : null}
        </section>

        <p style={{ ...textStyle, marginTop: 22, paddingTop: 14, borderTop: `1px dashed ${COLORS.dash}`, fontSize: 12, color: COLORS.textMuted }}>
          First-owner bootstrap, owner recovery, and cross-tenant provisioning remain operator-only
          deployment workflows. Contact the platform operator if every owner credential is lost.
        </p>
      </GlassPanel>
    </PageShell>
  );
}
