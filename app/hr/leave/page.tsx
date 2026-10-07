'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/auth-fetch';
import { fmtRange, todayIST } from '@/lib/format';
import { LEAVE_TYPES } from '@/lib/leave-flow';

interface Row {
  id: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  staff_type: string;
  leave_type: string;
  from_date: string;
  to_date: string;
  is_half_day: boolean;
  session: string | null;
  days: string;
  reason: string;
}

export default function HrLeaveRegister() {
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const [dept, setDept] = useState('');
  const q = useQuery({
    queryKey: ['hr-leave', month, dept],
    queryFn: () => api<{ requests: Row[] }>(`/api/hr/leave?month=${month}${dept ? `&department=${encodeURIComponent(dept)}` : ''}`),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Leave register" description="Leave fully approved by the chain (HOD → Principal → Dean).">
        <div className="flex gap-2">
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
          <Input placeholder="Department" value={dept} onChange={(e) => setDept(e.target.value)} className="w-40" />
        </div>
      </PageHeader>
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.requests.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="font-medium">{r.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.employee_code} · {r.staff_type === 'non_teaching' ? 'Non-teaching' : 'Faculty'}
                    </div>
                  </TableCell>
                  <TableCell>{r.department ?? '—'}</TableCell>
                  <TableCell>{LEAVE_TYPES[r.leave_type as keyof typeof LEAVE_TYPES] ?? r.leave_type}</TableCell>
                  <TableCell>{fmtRange(r.from_date, r.to_date)}{r.is_half_day && ` (${r.session})`}</TableCell>
                  <TableCell>{Number(r.days)}</TableCell>
                  <TableCell className="max-w-xs text-sm">{r.reason}</TableCell>
                </TableRow>
              ))}
              {q.data?.requests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">No approved leave this month.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
