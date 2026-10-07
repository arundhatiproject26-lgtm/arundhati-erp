'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useMe } from '@/hooks/use-me';
import { clearSession, loadSession } from '@/lib/cognito-client';
import { PORTALS } from '@/lib/portals';
import type { Role } from '@/lib/roles';
import { cn } from '@/lib/utils';

/** Client-side guard + chrome for one portal. The API routes enforce roles again. */
export function PortalShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const me = useMe();
  const portal = PORTALS[role];

  useEffect(() => {
    const ok = loadSession() !== null;
    setHasSession(ok);
    if (!ok) router.replace(`/login?portal=${role}`);
  }, [role, router]);

  useEffect(() => {
    if (me.error) router.replace(`/login?portal=${role}`);
  }, [me.error, role, router]);

  const signOut = () => {
    clearSession();
    qc.clear();
    router.replace('/');
  };

  if (!hasSession || me.isLoading || !me.data) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!me.data.roles.includes(role)) {
    return (
      <div className="mx-auto max-w-md p-8 space-y-4">
        <p>This account does not have {portal.title} portal access.</p>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    );
  }

  const otherPortals = me.data.roles.filter((r) => r !== role);

  return (
    <div className="min-h-screen md:flex">
      <aside className="no-print border-b bg-background md:w-60 md:border-b-0 md:border-r">
        <div className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">Arundhati ERP</div>
          <div className="text-lg font-semibold">{portal.title} portal</div>
          <div className="mt-1 truncate text-sm text-muted-foreground">
            {me.data.employee?.full_name ?? me.data.email}
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">
          {portal.nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-muted',
                pathname === item.href && 'bg-muted font-medium',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="space-y-1 p-2">
          {otherPortals.map((r) => (
            <Link key={r} href={`/${r}`} className="block rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
              Switch to {PORTALS[r].title}
            </Link>
          ))}
          <Button variant="ghost" size="sm" className="w-full justify-start" onClick={signOut}>
            Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
