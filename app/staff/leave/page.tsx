'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { SimpleSelect } from '@/components/simple-select';
import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { api, postJson } from '@/lib/auth-fetch';
import { fmtRange, todayIST } from '@/lib/format';
import { HALF_DAY_TYPES, IN_FLIGHT, LEAVE_TYPES, requestedDays, type LeaveStatus } from '@/lib/leave-flow';
import type { BalanceLine } from '@/lib/leave-service';

interface LeaveRow {
  id: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  is_half_day: boolean;
  session: string | null;
  days: string;
  reason: string;
  status: string;
  hod_remarks: string | null;
  principal_remarks: string | null;
  dean_remarks: string | null;
  created_at: string;
}

const TYPE_OPTIONS = Object.entries(LEAVE_TYPES).map(([value, label]) => ({ value, label }));

export default function StaffLeavePage() {
  const qc = useQueryClient();
  const year = Number(todayIST().slice(0, 4));
  const balances = useQuery({
    queryKey: ['leave-balances', year],
    queryFn: () => api<{ balances: BalanceLine[] }>(`/api/staff/leave-balances?year=${year}`),
  });
  const requests = useQuery({ queryKey: ['my-leave'], queryFn: () => api<{ requests: LeaveRow[] }>('/api/staff/leave') });

  const [type, setType] = useState('CL');
  const [from, setFrom] = useState(todayIST());
  const [to, setTo] = useState(todayIST());
  const [halfDay, setHalfDay] = useState(false);
  const [session, setSession] = useState('FN');
  const [reason, setReason] = useState('');

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['my-leave'] });
    qc.invalidateQueries({ queryKey: ['leave-balances'] });
  };

  const apply = useMutation({
    mutationFn: () =>
      postJson('/api/staff/leave', {
        leave_type: type,
        from_date: from,
        to_date: halfDay ? from : to,
        is_half_day: halfDay,
        session: halfDay ? session : null,
        reason,
      }),
    onSuccess: () => {
      setReason('');
      refresh();
    },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => postJson(`/api/staff/leave/${id}`, {}, 'PATCH'),
    onSuccess: refresh,
  });

  const canHalf = HALF_DAY_TYPES.has(type);
  const days = requestedDays(from, halfDay ? from : to, halfDay && canHalf);

  return (
    <div className="space-y-6">
      <PageHeader title="Leave" description="Requests go HOD → Principal → Dean. HR sees them once the Dean approves." />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {balances.data?.balances.map((b) => (
          <Card key={b.leave_type}>
            <CardContent className="p-4">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className="text-2xl font-semibold">{b.left ?? '—'}</div>
              <div className="text-xs text-muted-foreground">
                {b.allocated === null ? 'no limit set' : `of ${b.allocated} · ${b.in_flight} pending`}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply for leave</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              apply.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="type">Leave type</Label>
              <SimpleSelect id="type" value={type} onChange={(v) => { setType(v); if (!HALF_DAY_TYPES.has(v)) setHalfDay(false); }} options={TYPE_OPTIONS} />
            </div>
            <div className="flex items-end gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={halfDay} disabled={!canHalf} onChange={(e) => setHalfDay(e.target.checked)} />
                Half day
              </label>
              {halfDay && (
                <SimpleSelect className="w-40" value={session} onChange={setSession} options={[{ value: 'FN', label: 'Forenoon' }, { value: 'AN', label: 'Afternoon' }]} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="from">{halfDay ? 'Date' : 'From'}</Label>
              <Input id="from" type="date" required value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} />
            </div>
            {!halfDay && (
              <div className="space-y-1.5">
                <Label htmlFor="to">To</Label>
                <Input id="to" type="date" required min={from} value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            )}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="reason">Reason</Label>
              <Textarea id="reason" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {apply.error && (
              <Alert variant="destructive" className="md:col-span-2">
                <AlertDescription>{(apply.error as Error).message}</AlertDescription>
              </Alert>
            )}
            {apply.isSuccess && (
              <Alert className="md:col-span-2">
                <AlertDescription>Leave request submitted.</AlertDescription>
              </Alert>
            )}
            <div className="md:col-span-2">
              <Button type="submit" disabled={apply.isPending}>
                {apply.isPending ? 'Submitting…' : `Apply for ${days} day${days === 1 ? '' : 's'}`}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">My requests</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Remarks</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.data?.requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{LEAVE_TYPES[r.leave_type as keyof typeof LEAVE_TYPES] ?? r.leave_type}</TableCell>
                  <TableCell>
                    {fmtRange(r.from_date, r.to_date)}
                    {r.is_half_day && <span className="text-muted-foreground"> ({r.session})</span>}
                  </TableCell>
                  <TableCell>{Number(r.days)}</TableCell>
                  <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                  <TableCell className="max-w-xs text-sm text-muted-foreground">
                    {[r.hod_remarks && `HOD: ${r.hod_remarks}`, r.principal_remarks && `Principal: ${r.principal_remarks}`, r.dean_remarks && `Dean: ${r.dean_remarks}`]
                      .filter(Boolean).join(' · ') || '—'}
                  </TableCell>
                  <TableCell>
                    {IN_FLIGHT.includes(r.status as LeaveStatus) && (
                      <Button variant="ghost" size="sm" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {requests.data?.requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No leave requests yet.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
