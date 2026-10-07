// Browser-side Cognito session storage + token accessor. No AWS SDK in the
// bundle: refresh goes through our own /api/auth/refresh route.

const SESSION_KEY = 'erp-session';
const REMEMBER_KEY = 'erp-auth-remember';
const REFRESH_SAFETY_MARGIN_MS = 60_000;

const isBrowser = typeof window !== 'undefined';

export interface StoredSession {
  idToken: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // epoch ms
}

let persistent = isBrowser ? window.localStorage.getItem(REMEMBER_KEY) !== '0' : true;

const activeStore = () => (persistent ? window.localStorage : window.sessionStorage);
const otherStore = () => (persistent ? window.sessionStorage : window.localStorage);

/** Call BEFORE signing in so the new session lands in the right store. */
export function setAuthPersistence(remember: boolean): void {
  if (!isBrowser) return;
  persistent = remember;
  window.localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
}

export function storeSession(
  tokens: { idToken: string; accessToken: string; refreshToken?: string; expiresIn: number },
  rememberMe?: boolean,
): void {
  if (!isBrowser) return;
  if (rememberMe !== undefined) setAuthPersistence(rememberMe);
  const session: StoredSession = {
    idToken: tokens.idToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken ?? loadSession()?.refreshToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
  try { otherStore().removeItem(SESSION_KEY); } catch { /* ignore */ }
  activeStore().setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): StoredSession | null {
  if (!isBrowser) return null;
  const raw = activeStore().getItem(SESSION_KEY) ?? otherStore().getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (!isBrowser) return;
  try { window.localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}

/** Decode a JWT payload without verifying it — safe here only because we're
 * reading back a token we ourselves just stored from a trusted server response. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

export function getUserIdFromToken(token: string): string | null {
  const payload = decodeJwtPayload(token);
  return typeof payload?.sub === 'string' ? payload.sub : null;
}

export function getCurrentUserId(): string | null {
  const session = loadSession();
  return session ? getUserIdFromToken(session.idToken) : null;
}

let refreshInFlight: Promise<string> | null = null;

/** Plain async function (not a hook) — usable from React components, custom
 * hooks, and plain lib files alike. Returns the current, valid ID token,
 * refreshing first if it's within REFRESH_SAFETY_MARGIN_MS of expiry. */
export async function getAccessToken(): Promise<string> {
  const session = loadSession();
  if (!session) throw { status: 401, message: 'Not signed in' };

  if (session.expiresAt - Date.now() > REFRESH_SAFETY_MARGIN_MS) {
    return session.idToken;
  }
  if (!session.refreshToken) {
    clearSession();
    throw { status: 401, message: 'Session expired' };
  }

  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken: session.refreshToken }),
        });
        if (!res.ok) {
          clearSession();
          throw { status: 401, message: 'Session expired' };
        }
        const tokens = await res.json();
        storeSession(tokens);
        return tokens.idToken as string;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}
