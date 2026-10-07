'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { storeSession, clearSession } from '@/lib/cognito-client';
import { api, postJson } from '@/lib/auth-fetch';
import { PORTALS } from '@/lib/portals';
import type { Me } from '@/lib/auth';
import type { Role } from '@/lib/roles';

type Tokens = { idToken: string; accessToken: string; refreshToken?: string; expiresIn: number };
type SigninResult = Tokens | { challenge: 'NEW_PASSWORD_REQUIRED'; session: string };

function LoginForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const params = useSearchParams();
  const portal = (params.get('portal') ?? 'staff') as Role;
  const meta = PORTALS[portal] ?? PORTALS.staff;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finish = async (tokens: Tokens) => {
    storeSession(tokens, true);
    const me = await api<Me>('/api/auth/me');
    if (!me.roles.includes(portal)) {
      clearSession();
      throw new Error(`This account has no ${meta.title} portal access.`);
    }
    qc.setQueryData(['me'], me);
    router.replace(`/${portal}`);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (challenge) {
        if (newPassword !== confirm) throw new Error('Passwords do not match.');
        await finish(await postJson<Tokens>('/api/auth/complete-new-password', { email, session: challenge, newPassword }));
      } else {
        const res = await postJson<SigninResult>('/api/auth/signin', { email, password });
        if ('challenge' in res) setChallenge(res.session);
        else await finish(res);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{meta.title} login</CardTitle>
        <CardDescription>{challenge ? 'Set a new password to finish your first sign-in.' : meta.blurb}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          {!challenge ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="new">New password</Label>
                <Input id="new" type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
            </>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Please wait…' : challenge ? 'Set password' : 'Sign in'}
          </Button>
          <Link href="/" className="block text-center text-sm text-muted-foreground hover:underline">
            Choose another portal
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
