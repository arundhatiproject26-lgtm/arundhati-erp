'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/auth-fetch';
import { fmtDate } from '@/lib/format';
import { STATUS_LABEL, IN_FLIGHT } from '@/lib/leave-flow';

interface Overview {
  headcount: Record<string, number>;
  departments: { department: string; count: number }[];
  leavePipeline: Record<string, number>;
  pendingRegularizations: number;
  lastDay: { date: string; present: number; absent: number } | null;
}

function Stat({ label, value, href }: { label: string; value: number | string; href?: string }) {
  const body = (
    <Card className={href ? 'transition-colors hover:border-primary' : ''}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function HrOverview() {
  const q = useQuery({ queryKey: ['hr-overview'], queryFn: () => api<Overview>('/api/hr/overview') });
  if (q.error) return <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>;
  const d = q.data;
  return (
    <div className="space-y-6">
      <PageHeader title="HR overview" />
      {d && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Faculty" value={d.headcount.faculty ?? 0} href="/hr/employees" />
            <Stat label="Non-teaching staff" value={d.headcount.non_teaching ?? 0} href="/hr/employees" />
            <Stat label="Pending regularizations" value={d.pendingRegularizations} href="/hr/regularizations" />
            <Stat
              label={d.lastDay ? `Present / absent · ${fmtDate(d.lastDay.date)}` : 'Last imported day'}
              value={d.lastDay ? `${d.lastDay.present} / ${d.lastDay.absent}` : '—'}
              href="/hr/attendance"
            />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Leave in progress</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {IN_FLIGHT.map((s) => (
                  <div key={s} className="flex justify-between text-sm">
                    <span>{STATUS_LABEL[s]}</span>
                    <span className="font-medium">{d.leavePipeline[s] ?? 0}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Headcount by department</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {d.departments.map((r) => (
                  <div key={r.department} className="flex justify-between text-sm">
                    <span>{r.department}</span>
                    <span className="font-medium">{r.count}</span>
                  </div>
                ))}
                {d.departments.length === 0 && <p className="text-sm text-muted-foreground">No employees yet.</p>}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
