'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { LeaveStatusBadge } from '@/components/leave-status-badge';
import { api, postJson } from '@/lib/auth-fetch';
import { fmtRange } from '@/lib/format';
import { LEAVE_TYPES, type ApproverRole } from '@/lib/leave-flow';

interface Row {
  id: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  designation: string | null;
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
  applicant_is_dean: boolean;
}

const TITLES: Record<ApproverRole, { title: string; next: string }> = {
  hod: { title: 'Leave approvals — HOD', next: 'Approving sends it to the Principal.' },
  principal: { title: 'Leave approvals — Principal', next: 'Approving sends it to the Dean (a Dean’s own leave is final here).' },
  dean: { title: 'Leave approvals — Dean', next: 'Your approval is final; HR then sees the leave.' },
};

const typeLabel = (t: string) => LEAVE_TYPES[t as keyof typeof LEAVE_TYPES] ?? t;

function DecisionRow({ row, role }: { row: Row; role: ApproverRole }) {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState('');
  const decide = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') =>
      postJson(`/api/approvals/${role}/${row.id}`, { decision, remarks: remarks || undefined }, 'PATCH'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approvals', role] }),
  });
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="font-medium">
              {row.full_name} <span className="text-sm text-muted-foreground">{row.employee_code}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {[row.designation, row.department].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="font-medium">{typeLabel(row.leave_type)} · {Number(row.days)} day{Number(row.days) === 1 ? '' : 's'}</div>
            <div>{fmtRange(row.from_date, row.to_date)}{row.is_half_day && ` (${row.session})`}</div>
          </div>
        </div>
        <p className="text-sm">{row.reason}</p>
        {(row.hod_remarks || row.principal_remarks) && (
          <p className="text-xs text-muted-foreground">
            {[row.hod_remarks && `HOD: ${row.hod_remarks}`, row.principal_remarks && `Principal: ${row.principal_remarks}`].filter(Boolean).join(' · ')}
          </p>
        )}
        <Textarea placeholder="Remarks (required to reject)" value={remarks} onChange={(e) => setRemarks(e.target.value)} className="min-h-[60px]" />
        {decide.error && (
          <Alert variant="destructive"><AlertDescription>{(decide.error as Error).message}</AlertDescription></Alert>
        )}
        <div className="flex gap-2">
          <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate('approved')}>Approve</Button>
          <Button size="sm" variant="destructive" disabled={decide.isPending || !remarks.trim()} onClick={() => decide.mutate('rejected')}>
            Reject
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApprovalQueue({ role }: { role: ApproverRole }) {
  const q = useQuery({
    queryKey: ['approvals', role],
    queryFn: () => api<{ queue: Row[]; recent: Row[]; department: string | null }>(`/api/approvals/${role}`),
  });
  const t = TITLES[role];
  const description = role === 'hod' && q.data?.department ? `${q.data.department} department. ${t.next}` : t.next;

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={description} />
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.data && q.data.queue.length === 0 && <p className="text-sm text-muted-foreground">Nothing waiting for you.</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        {q.data?.queue.map((row) => <DecisionRow key={row.id} row={row} role={role} />)}
      </div>

      {q.data && q.data.recent.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recently decided by you</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Current status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.recent.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.full_name}</TableCell>
                    <TableCell>{typeLabel(r.leave_type)}</TableCell>
                    <TableCell>{fmtRange(r.from_date, r.to_date)}</TableCell>
                    <TableCell><LeaveStatusBadge status={r.status} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
