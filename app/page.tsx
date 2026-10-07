import Link from 'next/link';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PORTALS } from '@/lib/portals';
import { ROLE_ORDER } from '@/lib/roles';

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl p-6 md:p-12">
      <h1 className="text-2xl font-semibold">Arundhati ERP</h1>
      <p className="mt-1 text-muted-foreground">Choose your portal to sign in.</p>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLE_ORDER.map((role) => (
          <Link key={role} href={`/login?portal=${role}`}>
            <Card className="h-full transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle>{PORTALS[role].title}</CardTitle>
                <CardDescription>{PORTALS[role].blurb}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </main>
  );
}
