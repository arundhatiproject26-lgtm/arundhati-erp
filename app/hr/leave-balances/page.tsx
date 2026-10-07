'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { SimpleSelect } from '@/components/simple-select';
import { api, postJson } from '@/lib/auth-fetch';
import { todayIST } from '@/lib/format';
import { LEAVE_TYPES } from '@/lib/leave-flow';

interface Employee { id: string; full_name: string; employee_code: string | null; department: string | null }
interface Allocation { employee_id: string; leave_type: string; allocated: string }

const TYPES = Object.entries(LEAVE_TYPES);
const ALL = '__all__';

export default function HrLeaveBalances() {
  const qc = useQueryClient();
  const [year, setYear] = useState(Number(todayIST().slice(0, 4)));
  const [type, setType] = useState('CL');
  const [days, setDays] = useState('12');
  const [who, setWho] = useState(ALL);

  const employees = useQuery({ queryKey: ['hr-employees'], queryFn: () => api<{ employees: Employee[] }>('/api/hr/employees') });
  const allocations = useQuery({
    queryKey: ['hr-allocations', year],
    queryFn: () => api<{ allocations: Allocation[] }>(`/api/hr/leave-balances?year=${year}`),
  });

  const grid = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of allocations.data?.allocations ?? []) m.set(`${a.employee_id}:${a.leave_type}`, Number(a.allocated));
    return m;
  }, [allocations.data]);

  const save = useMutation({
    mutationFn: () =>
      postJson('/api/hr/leave-balances', {
        year,
        leave_type: type,
        allocated: Number(days),
        employee_id: who === ALL ? undefined : who,
      }, 'PUT'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-allocations', year] }),
  });

  const empOptions = [
    { value: ALL, label: 'All active employees' },
    ...(employees.data?.employees ?? []).map((e) => ({
      value: e.id,
      label: `${e.full_name}${e.employee_code ? ` (${e.employee_code})` : ''}`,
    })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Leave balances" description="Days allocated per leave type per year. A type with no allocation is not capped.">
        <Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
      </PageHeader>

      <Card>
        <CardHeader><CardTitle className="text-base">Set allocation for {year}</CardTitle></CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <SimpleSelect className="w-72" value={who} onChange={setWho} options={empOptions} />
            </div>
            <div className="space-y-1.5">
              <Label>Leave type</Label>
              <SimpleSelect className="w-48" value={type} onChange={setType} options={TYPES.map(([value, label]) => ({ value, label }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="days">Days</Label>
              <Input id="days" type="number" min={0} step={0.5} className="w-24" value={days} onChange={(e) => setDays(e.target.value)} />
            </div>
            <Button type="submit" disabled={save.isPending}>Save</Button>
          </form>
          {save.error && <Alert variant="destructive" className="mt-3"><AlertDescription>{(save.error as Error).message}</AlertDescription></Alert>}
          {save.isSuccess && <p className="mt-3 text-sm text-muted-foreground">Saved.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                {TYPES.map(([t]) => <TableHead key={t} className="text-right">{t}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.data?.employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <div className="font-medium">{e.full_name}</div>
                    <div className="text-xs text-muted-foreground">{e.department ?? '—'}</div>
                  </TableCell>
                  {TYPES.map(([t]) => (
                    <TableCell key={t} className="text-right">{grid.get(`${e.id}:${t}`) ?? '—'}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
