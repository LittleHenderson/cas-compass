import { API_BASE } from './config';

const TOKEN_KEY = 'nc_jwt_token';

export interface LoginCredentials {
  username: string;
  /** Per-account API credential (e.g. `casak_...`) verified server-side in account mode. */
  apiCredential?: string;
  /** Optional explicit runtime mint credential entered by the user (never bundled or persisted). */
  runtimeMintSecret?: string;
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/**
 * Authenticate with the CAS Lab API using user-supplied credentials.
 * Credentials remain strictly in memory for the single POST request and are
 * never bundled into client assets or persisted in browser storage.
 */
export async function loginWithCredentials(credentials: LoginCredentials): Promise<string> {
  const username = credentials.username.trim();
  if (!username) {
    throw new Error('Username or account email is required.');
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const body: Record<string, string> = { username };

  const apiCredential = credentials.apiCredential?.trim() ?? '';
  if (apiCredential) {
    body.api_credential = apiCredential;
  }

  const runtimeMintSecret = credentials.runtimeMintSecret?.trim() ?? '';
  if (runtimeMintSecret) {
    headers['X-Auth-Mint-Secret'] = runtimeMintSecret;
  }

  const res = await fetch(`${API_BASE}/auth/token`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof errBody.detail === 'string' ? errBody.detail : 'Failed to authenticate');
  }

  const data: { token?: string } = await res.json();
  if (!data.token) {
    throw new Error('Server did not return an authentication token.');
  }

  setToken(data.token);
  return data.token;
}

function decodeBase64Url(value: string): string | null {
  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    return atob(padded);
  } catch {
    return null;
  }
}

function getTokenPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const decoded = decodeBase64Url(parts[1]);
  if (!decoded) return null;
  try {
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isTokenExpired(token: string): boolean {
  const payload = getTokenPayload(token);
  if (!payload) return true;
  const exp = payload.exp;
  if (typeof exp !== 'number') return false;
  return Date.now() >= exp * 1000;
}

export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  if (isTokenExpired(token)) {
    clearToken();
    return false;
  }
  return true;
}
