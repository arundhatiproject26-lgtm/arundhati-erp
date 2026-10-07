'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { SimpleSelect } from '@/components/simple-select';
import { api, postJson } from '@/lib/auth-fetch';
import { fmtDate } from '@/lib/format';

interface Reg {
  id: string; punch_date: string; requested_in: string; requested_out: string; reason: string; status: string; remarks: string | null;
  full_name: string; employee_code: string | null; department: string | null;
  current_in: string | null; current_out: string | null; current_status: string | null;
}

function Decide({ reg }: { reg: Reg }) {
  const qc = useQueryClient();
  const [remarks, setRemarks] = useState('');
  const m = useMutation({
    mutationFn: (decision: 'approved' | 'rejected') => postJson('/api/hr/regularizations', { id: reg.id, decision, remarks: remarks || undefined }, 'PATCH'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-regs'] }),
  });
  return (
    <div className="flex min-w-64 flex-col gap-2">
      <Input placeholder="Remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} />
      <div className="flex gap-2">
        <Button size="sm" disabled={m.isPending} onClick={() => m.mutate('approved')}>Approve</Button>
        <Button size="sm" variant="destructive" disabled={m.isPending} onClick={() => m.mutate('rejected')}>Reject</Button>
      </div>
      {m.error && <span className="text-xs text-destructive">{(m.error as Error).message}</span>}
    </div>
  );
}

export default function HrRegularizations() {
  const [status, setStatus] = useState('pending');
  const q = useQuery({ queryKey: ['hr-regs', status], queryFn: () => api<{ regularizations: Reg[] }>(`/api/hr/regularizations?status=${status}`) });
  return (
    <div className="space-y-6">
      <PageHeader title="Regularizations" description="Approving rewrites that day's punch as Present (Regularized).">
        <SimpleSelect className="w-40" value={status} onChange={setStatus} options={['pending', 'approved', 'rejected'].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
      </PageHeader>
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>On record</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>{status === 'pending' ? 'Decision' : 'Remarks'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.regularizations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground">{r.employee_code} · {r.department ?? '—'}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(r.punch_date)}</TableCell>
                  <TableCell className="text-sm">{r.current_in ?? '—'} – {r.current_out ?? '—'}<div className="text-xs text-muted-foreground">{r.current_status ?? 'no row'}</div></TableCell>
                  <TableCell>{r.requested_in} – {r.requested_out}</TableCell>
                  <TableCell className="max-w-xs text-sm">{r.reason}</TableCell>
                  <TableCell>{status === 'pending' ? <Decide reg={r} /> : r.remarks ?? '—'}</TableCell>
                </TableRow>
              ))}
              {q.data?.regularizations.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Nothing here.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
