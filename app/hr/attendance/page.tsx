'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { SimpleSelect } from '@/components/simple-select';
import { AttendanceView } from '@/components/attendance-view';
import { api } from '@/lib/auth-fetch';
import { fmtDate, todayIST } from '@/lib/format';
import type { AttendanceSummary, DerivedPunch } from '@/lib/hr-attendance';

interface Employee { id: string; full_name: string; employee_code: string | null }
interface Day { punch_date: string; rows: number }
interface Rec { id: string; employee_code: string; employee_name: string | null; punch_in: string | null; punch_out: string | null; status: string | null; full_name: string | null; employee_id: string | null }

function ByEmployee() {
  const [month, setMonth] = useState(todayIST().slice(0, 7));
  const [employeeId, setEmployeeId] = useState('');
  const employees = useQuery({ queryKey: ['hr-employees'], queryFn: () => api<{ employees: Employee[] }>('/api/hr/employees') });
  const q = useQuery({
    queryKey: ['hr-attendance', employeeId, month],
    enabled: Boolean(employeeId),
    queryFn: () => api<{ rows: DerivedPunch[]; summary: AttendanceSummary | null }>(`/api/hr/attendance?employee_id=${employeeId}&month=${month}`),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <SimpleSelect
          className="w-80"
          placeholder="Choose an employee"
          value={employeeId}
          onChange={setEmployeeId}
          options={(employees.data?.employees ?? []).map((e) => ({ value: e.id, label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ''}` }))}
        />
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-40" />
      </div>
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      {q.data && <AttendanceView rows={q.data.rows} summary={q.data.summary} />}
    </div>
  );
}

function ByDay() {
  const days = useQuery({ queryKey: ['hr-punch-days'], queryFn: () => api<{ days: Day[] }>('/api/hr/attendance') });
  const [date, setDate] = useState('');
  const recs = useQuery({
    queryKey: ['hr-punch-day', date],
    enabled: Boolean(date),
    queryFn: () => api<{ records: Rec[] }>(`/api/hr/attendance?date=${date}`),
  });
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      <Card>
        <CardHeader><CardTitle className="text-sm">Imported days</CardTitle></CardHeader>
        <CardContent className="max-h-[60vh] space-y-1 overflow-y-auto">
          {days.data?.days.map((d) => (
            <button
              key={d.punch_date}
              onClick={() => setDate(d.punch_date)}
              className={`flex w-full justify-between rounded px-2 py-1 text-sm hover:bg-muted ${date === d.punch_date ? 'bg-muted font-medium' : ''}`}
            >
              <span>{fmtDate(d.punch_date)}</span>
              <span className="text-muted-foreground">{d.rows}</span>
            </button>
          ))}
          {days.data?.days.length === 0 && <p className="text-sm text-muted-foreground">Nothing imported yet.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>In</TableHead>
                <TableHead>Out</TableHead>
                <TableHead>Device status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recs.data?.records.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.employee_code}</TableCell>
                  <TableCell>
                    {r.full_name ?? r.employee_name ?? '—'}
                    {!r.employee_id && <span className="ml-2 text-xs text-destructive">not on staff list</span>}
                  </TableCell>
                  <TableCell>{r.punch_in ?? '—'}</TableCell>
                  <TableCell>{r.punch_out ?? '—'}</TableCell>
                  <TableCell>{r.status ?? '—'}</TableCell>
                </TableRow>
              ))}
              {!date && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Pick a day.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default function HrAttendance() {
  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Derived from biometric punches, holidays and approved leave." />
      <Tabs defaultValue="employee">
        <TabsList>
          <TabsTrigger value="employee">By employee</TabsTrigger>
          <TabsTrigger value="day">By day</TabsTrigger>
        </TabsList>
        <TabsContent value="employee"><ByEmployee /></TabsContent>
        <TabsContent value="day"><ByDay /></TabsContent>
      </Tabs>
    </div>
  );
}
