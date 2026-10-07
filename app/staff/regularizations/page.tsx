'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { api, postJson } from '@/lib/auth-fetch';
import { fmtDate, todayIST } from '@/lib/format';

interface Reg { id: string; punch_date: string; requested_in: string; requested_out: string; reason: string; status: string; remarks: string | null }

export default function StaffRegularizations() {
  const qc = useQueryClient();
  const [date, setDate] = useState('');
  const [inT, setIn] = useState('09:00');
  const [outT, setOut] = useState('17:00');
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: ['my-regs'], queryFn: () => api<{ regularizations: Reg[] }>('/api/staff/regularizations') });
  const submit = useMutation({
    mutationFn: () => postJson('/api/staff/regularizations', { punch_date: date, requested_in: inT, requested_out: outT, reason }),
    onSuccess: () => { setReason(''); qc.invalidateQueries({ queryKey: ['my-regs'] }); },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Regularization" description="Missed a punch or the device was down? Ask HR to correct the day." />
      <Card>
        <CardHeader><CardTitle className="text-base">New request</CardTitle></CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
            <div className="space-y-1.5">
              <Label htmlFor="d">Date</Label>
              <Input id="d" type="date" required max={todayIST()} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="in">In time</Label>
              <Input id="in" type="time" required value={inT} onChange={(e) => setIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="out">Out time</Label>
              <Input id="out" type="time" required value={outT} onChange={(e) => setOut(e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-3">
              <Label htmlFor="r">Reason</Label>
              <Textarea id="r" required minLength={3} value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            {submit.error && <Alert variant="destructive" className="md:col-span-3"><AlertDescription>{(submit.error as Error).message}</AlertDescription></Alert>}
            <div><Button type="submit" disabled={submit.isPending}>Submit</Button></div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>In – Out</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.regularizations.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDate(r.punch_date)}</TableCell>
                  <TableCell>{r.requested_in} – {r.requested_out}</TableCell>
                  <TableCell className="max-w-xs text-sm">{r.reason}{r.remarks && <div className="text-muted-foreground">HR: {r.remarks}</div>}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'approved' ? 'default' : r.status === 'rejected' ? 'destructive' : 'secondary'}>{r.status}</Badge>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.regularizations.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No requests yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
