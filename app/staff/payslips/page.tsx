'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/page-header';
import { SimpleSelect } from '@/components/simple-select';
import { PayslipCard, monthName, type Payslip } from '@/components/payslip-card';
import { api } from '@/lib/auth-fetch';

interface Resp {
  employee: { full_name: string; employee_code: string | null; department: string | null; designation: string | null } | undefined;
  payslips: Payslip[];
}

export default function StaffPayslips() {
  const q = useQuery({ queryKey: ['my-payslips'], queryFn: () => api<Resp>('/api/staff/payslips') });
  const [selected, setSelected] = useState('');
  if (q.error) return <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const slips = q.data.payslips;
  const current = slips.find((p) => p.id === selected) ?? slips[0];

  return (
    <div className="space-y-6">
      <PageHeader title="Payslips">
        {slips.length > 0 && (
          <div className="no-print flex gap-2">
            <SimpleSelect
              className="w-52"
              value={current?.id ?? ''}
              onChange={setSelected}
              options={slips.map((p) => ({ value: p.id, label: monthName(p.pay_month, p.pay_year) }))}
            />
            <Button variant="outline" onClick={() => window.print()}>Print</Button>
          </div>
        )}
      </PageHeader>
      {current && q.data.employee ? (
        <PayslipCard p={current} who={q.data.employee} />
      ) : (
        <p className="text-sm text-muted-foreground">No payslips have been published for you yet.</p>
      )}
    </div>
  );
}
