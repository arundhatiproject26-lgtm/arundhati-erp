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
import { fmtDate, todayIST } from '@/lib/format';

interface Holiday { holiday_date: string; name: string; day_type: string }

export default function Holidays() {
  const qc = useQueryClient();
  const [year, setYear] = useState(Number(todayIST().slice(0, 4)));
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [dayType, setDayType] = useState('holiday');
  const q = useQuery({ queryKey: ['holidays', year], queryFn: () => api<{ holidays: Holiday[] }>(`/api/hr/holidays?year=${year}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['holidays'] });
  const add = useMutation({
    mutationFn: () => postJson('/api/hr/holidays', { holiday_date: date, name, day_type: dayType }),
    onSuccess: () => { setName(''); setDate(''); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (d: string) => api(`/api/hr/holidays?date=${d}`, { method: 'DELETE' }),
    onSuccess: refresh,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Holidays" description="A holiday is not a working day. A reduced-timing day still counts, but without late/early rules.">
        <Input type="number" className="w-28" value={year} onChange={(e) => setYear(Number(e.target.value))} />
      </PageHeader>
      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
            <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
            <Input placeholder="Name, e.g. Diwali" required value={name} onChange={(e) => setName(e.target.value)} className="w-64" />
            <SimpleSelect className="w-48" value={dayType} onChange={setDayType} options={[{ value: 'holiday', label: 'Holiday' }, { value: 'reduced_timing', label: 'Reduced timing' }]} />
            <Button type="submit" disabled={add.isPending}>Add</Button>
          </form>
          {add.error && <Alert variant="destructive" className="mt-3"><AlertDescription>{(add.error as Error).message}</AlertDescription></Alert>}
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data?.holidays.map((h) => (
                <TableRow key={h.holiday_date}>
                  <TableCell>{fmtDate(h.holiday_date)}</TableCell>
                  <TableCell>{h.name}</TableCell>
                  <TableCell>{h.day_type === 'reduced_timing' ? 'Reduced timing' : 'Holiday'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(h.holiday_date)}>Remove</Button>
                  </TableCell>
                </TableRow>
              ))}
              {q.data?.holidays.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">No holidays declared for {year}.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
