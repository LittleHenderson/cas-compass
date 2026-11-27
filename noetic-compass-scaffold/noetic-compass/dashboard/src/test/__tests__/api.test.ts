import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { apiFetch, ApiError } from '../../api/client';
import {
  setToken,
  clearToken,
  getToken,
  isAuthenticated,
  loginWithCredentials,
} from '../../api/auth';

const server = setupServer();

function makeJwt(payload: Record<string, unknown>): string {
  const encoded = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  return `header.${encoded}.sig`;
}

beforeAll(() => server.listen());
afterEach(() => {
  server.resetHandlers();
  clearToken();
  vi.unstubAllEnvs();
});
afterAll(() => server.close());

describe('auth', () => {
  it('stores and retrieves token', () => {
    const token = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    setToken(token);
    expect(getToken()).toBe(token);
    expect(isAuthenticated()).toBe(true);
  });

  it('clears token', () => {
    setToken(makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    clearToken();
    expect(getToken()).toBeNull();
    expect(isAuthenticated()).toBe(false);
  });

  it('treats expired jwt as unauthenticated and clears it', () => {
    setToken(makeJwt({ exp: Math.floor(Date.now() / 1000) - 60 }));
    expect(isAuthenticated()).toBe(false);
    expect(getToken()).toBeNull();
  });

  it('submits user-supplied account credentials without persisting them in localStorage', async () => {
    let capturedBody: Record<string, unknown> = {};
    let capturedMintHeader: string | null = null;
    server.use(
      http.post('/api/auth/token', async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        capturedMintHeader = request.headers.get('X-Auth-Mint-Secret');
        return HttpResponse.json({ token: 'account-jwt' });
      }),
    );

    const token = await loginWithCredentials({
      username: 'user@example.com',
      apiCredential: 'casak_secret_test_credential_12345',
    });

    expect(token).toBe('account-jwt');
    expect(getToken()).toBe('account-jwt');
    expect(capturedBody).toEqual({
      username: 'user@example.com',
      api_credential: 'casak_secret_test_credential_12345',
    });
    expect(capturedMintHeader).toBeNull();
    expect(JSON.stringify(localStorage)).not.toContain('casak_secret_test_credential_12345');
  });

  it('never reads a build-time mint secret from environment variables', async () => {
    vi.stubEnv('VITE_AUTH_MINT_SECRET', 'should-never-be-sent');
    let capturedMintHeader: string | null = null;
    server.use(
      http.post('/api/auth/token', ({ request }) => {
        capturedMintHeader = request.headers.get('X-Auth-Mint-Secret');
        return HttpResponse.json({ token: 'jwt-without-env-secret' });
      }),
    );

    await loginWithCredentials({ username: 'user@example.com' });
    expect(capturedMintHeader).toBeNull();
  });

  it('forwards explicit runtime mint secret only for the single login POST and never stores it', async () => {
    let capturedMintHeader: string | null = null;
    server.use(
      http.post('/api/auth/token', ({ request }) => {
        capturedMintHeader = request.headers.get('X-Auth-Mint-Secret');
        return HttpResponse.json({ token: 'runtime-jwt' });
      }),
    );

    await loginWithCredentials({
      username: 'operator',
      runtimeMintSecret: 'ephemeral-runtime-secret',
    });

    expect(capturedMintHeader).toBe('ephemeral-runtime-secret');
    expect(getToken()).toBe('runtime-jwt');
    expect(JSON.stringify(localStorage)).not.toContain('ephemeral-runtime-secret');
  });
});

describe('apiFetch', () => {
  it('attaches Authorization header', async () => {
    setToken('my-jwt');
    let capturedAuth = '';
    server.use(
      http.get('/api/health', ({ request }) => {
        capturedAuth = request.headers.get('Authorization') ?? '';
        return HttpResponse.json({ status: 'ok' });
      }),
    );
    await apiFetch('/health');
    expect(capturedAuth).toBe('Bearer my-jwt');
  });

  it('clears token and throws ApiError on 401 without silently re-minting', async () => {
    setToken('my-jwt');
    let mintCalls = 0;
    server.use(
      http.post('/api/auth/token', () => {
        mintCalls += 1;
        return HttpResponse.json({ token: 'should-not-be-called' });
      }),
      http.get('/api/config', () =>
        HttpResponse.json({ detail: 'Invalid token', error_type: 'auth_error' }, { status: 401 }),
      ),
    );
    try {
      await apiFetch('/config');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(401);
      expect(err.detail).toBe('Invalid token');
      expect(err.errorType).toBe('auth_error');
      expect(getToken()).toBeNull();
      expect(mintCalls).toBe(0);
    }
  });

  it('throws ApiError on 422', async () => {
    server.use(
      http.put('/api/config', () =>
        HttpResponse.json({ detail: 'dial out of range' }, { status: 422 }),
      ),
    );
    try {
      await apiFetch('/config', { method: 'PUT', body: '{}' });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(422);
    }
  });

  it('throws a network_error when the backend cannot be reached', async () => {
    server.use(
      http.get('/api/health', () => HttpResponse.error()),
    );
    try {
      await apiFetch('/health');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      const err = e as ApiError;
      expect(err.status).toBe(0);
      expect(err.errorType).toBe('network_error');
      expect(err.detail).toContain('Unable to reach API');
    }
  });

  it('surfaces 429 monthly limit errors without silently minting a new identity', async () => {
    setToken('old-jwt');
    let mintCalls = 0;
    server.use(
      http.post('/api/auth/token', () => {
        mintCalls += 1;
        return HttpResponse.json({ token: 'fresh-jwt' });
      }),
      http.post('/api/notation/compile', () =>
        HttpResponse.json(
          { detail: 'Monthly limit exceeded (500 assessments). Upgrade tier or wait until next month.' },
          { status: 429 },
        ),
      ),
    );

    try {
      await apiFetch('/notation/compile', {
        method: 'POST',
        body: JSON.stringify({ expression: 'Phi<3:8:5:2>' }),
      });
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ApiError);
      expect((e as ApiError).status).toBe(429);
      expect(mintCalls).toBe(0);
      expect(getToken()).toBe('old-jwt');
    }
  });
});
