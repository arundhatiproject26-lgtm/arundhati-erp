'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/page-header';
import { AttendanceView } from '@/components/attendance-view';
import { api } from '@/lib/auth-fetch';
import { todayIST } from '@/lib/format';
import type { AttendanceSummary, DerivedPunch } from '@/lib/hr-attendance';

export default function StaffAttendance() {
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const q = useQuery({
    queryKey: ['my-attendance', month],
    queryFn: () => api<{ rows: DerivedPunch[]; summary: AttendanceSummary | null; employee_code: string | null }>(`/api/staff/attendance?month=${month}`),
  });
  return (
    <div className="space-y-6">
      <PageHeader title="My attendance" description={`Biometric punches imported by HR${q.data?.employee_code ? ` · code ${q.data.employee_code}` : ''}. Wrong day? Raise a regularization.`}>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
      </PageHeader>
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      {q.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {q.data && <AttendanceView rows={q.data.rows} summary={q.data.summary} />}
    </div>
  );
}
