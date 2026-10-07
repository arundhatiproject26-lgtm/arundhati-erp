'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { useMe } from '@/hooks/use-me';
import { api } from '@/lib/auth-fetch';
import { fmtRange, todayIST } from '@/lib/format';
import { LEAVE_TYPES } from '@/lib/leave-flow';
import type { AttendanceSummary } from '@/lib/hr-attendance';
import type { BalanceLine } from '@/lib/leave-service';

interface LeaveRow { id: string; leave_type: string; from_date: string; to_date: string; status: string }

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
    </div>
  );
}

export default function StaffHome() {
  const me = useMe();
  const today = todayIST();
  const month = today.slice(0, 7);
  const att = useQuery({
    queryKey: ['my-attendance', month],
    queryFn: () => api<{ summary: AttendanceSummary | null }>(`/api/staff/attendance?month=${month}`),
  });
  const bal = useQuery({
    queryKey: ['leave-balances', Number(today.slice(0, 4))],
    queryFn: () => api<{ balances: BalanceLine[] }>(`/api/staff/leave-balances?year=${today.slice(0, 4)}`),
  });
  const leave = useQuery({ queryKey: ['my-leave'], queryFn: () => api<{ requests: LeaveRow[] }>('/api/staff/leave') });
  const e = me.data?.employee;
  const s = att.data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome${e ? `, ${e.full_name}` : ''}`}
        description={e ? [e.designation, e.department, e.staff_type === 'non_teaching' ? 'Non-teaching' : 'Faculty'].filter(Boolean).join(' · ') : undefined}
      />
      {me.data && !e && (
        <p className="text-sm text-muted-foreground">No employee record is linked to this login yet. Contact HR.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base"><Link href="/staff/attendance" className="hover:underline">Attendance this month</Link></CardTitle></CardHeader>
          <CardContent>
            {s ? (
              <div className="grid grid-cols-4 gap-3">
                <Stat label="Present" value={s.present} />
                <Stat label="Absent" value={s.absent} />
                <Stat label="Late" value={s.late} />
                <Stat label="LOP days" value={s.lop_days} />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No punches imported yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base"><Link href="/staff/leave" className="hover:underline">Leave left this year</Link></CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {bal.data?.balances.filter((b) => b.allocated !== null).map((b) => (
                <Stat key={b.leave_type} label={b.label} value={b.left ?? '—'} />
              ))}
            </div>
            {bal.data && bal.data.balances.every((b) => b.allocated === null) && (
              <p className="text-sm text-muted-foreground">HR has not set your leave allocation yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Recent leave requests</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableBody>
              {leave.data?.requests.slice(0, 5).map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{LEAVE_TYPES[r.leave_type as keyof typeof LEAVE_TYPES] ?? r.leave_type}</TableCell>
                  <TableCell>{fmtRange(r.from_date, r.to_date)}</TableCell>
                  <TableCell className="text-right"><LeaveStatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
              {leave.data?.requests.length === 0 && (
                <TableRow><TableCell className="text-center text-muted-foreground">No requests yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
