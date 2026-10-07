'use client';
// Client-side fetch wrapper: adds the Cognito ID token and turns a non-2xx
// JSON `{ error }` into a thrown Error, so TanStack Query surfaces it.
import { getAccessToken } from '@/lib/cognito-client';

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  let token: string | null = null;
  try {
    token = await getAccessToken();
  } catch {
    token = null;
  }
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(path, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
  return body as T;
}

export const postJson = <T = unknown>(path: string, data: unknown, method = 'POST') =>
  api<T>(path, { method, body: JSON.stringify(data) });
