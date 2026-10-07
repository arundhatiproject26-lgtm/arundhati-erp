'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { api } from '@/lib/auth-fetch';
import { fmtMoney, todayIST } from '@/lib/format';
import type { Payslip } from '@/components/payslip-card';

type Row = Payslip & { full_name: string; employee_code: string | null; department: string | null };

export default function HrPayslips() {
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const [y, m] = month.split('-').map(Number);
  const q = useQuery({ queryKey: ['hr-payslips', month], queryFn: () => api<{ payslips: Row[] }>(`/api/hr/payslips?year=${y}&month=${m}`) });
  const total = (q.data?.payslips ?? []).reduce((n, p) => n + Number(p.net_pay), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Payslips" description="Published payslips for the month. Payslip rows are loaded by the payroll import.">
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
      </PageHeader>
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead className="text-right">Gross</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net pay</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.payslips.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs text-muted-foreground">{p.employee_code}</div>
                  </TableCell>
                  <TableCell>{p.department ?? '—'}</TableCell>
                  <TableCell className="text-right">{fmtMoney(Number(p.basic_salary) + Number(p.hra) + Number(p.allowances) + Number(p.incentive_total))}</TableCell>
                  <TableCell className="text-right">{fmtMoney(Number(p.pf_deduction) + Number(p.tax_deduction) + Number(p.other_deductions))}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(p.net_pay)}</TableCell>
                  <TableCell><Badge variant={p.status === 'paid' ? 'default' : 'secondary'}>{p.status}</Badge></TableCell>
                </TableRow>
              ))}
              {q.data && q.data.payslips.length > 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-right font-medium">Total</TableCell>
                  <TableCell className="text-right font-semibold">{fmtMoney(total)}</TableCell>
                  <TableCell />
                </TableRow>
              )}
              {q.data?.payslips.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No payslips for this month.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
