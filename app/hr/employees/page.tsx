'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { EmployeeForm, EMPTY_EMPLOYEE } from '@/components/employee-form';
import { api, postJson } from '@/lib/auth-fetch';

interface Employee {
  id: string; full_name: string; email: string; employee_code: string | null; department: string | null;
  designation: string | null; staff_type: string; status: string; user_id: string | null;
}

export default function HrEmployees() {
  const router = useRouter();
  const qc = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['hr-employees', showAll],
    queryFn: () => api<{ employees: Employee[] }>(`/api/hr/employees${showAll ? '?all=1' : ''}`),
  });
  const create = useMutation({
    mutationFn: (f: typeof EMPTY_EMPLOYEE) => postJson<{ employee: { id: string } }>('/api/hr/employees', f),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
      router.push(`/hr/employees/${res.employee.id}`);
    },
  });

  const s = search.trim().toLowerCase();
  const rows = (q.data?.employees ?? []).filter((e) =>
    !s || [e.full_name, e.email, e.employee_code, e.department].some((v) => v?.toLowerCase().includes(s)));

  return (
    <div className="space-y-6">
      <PageHeader title="Employees" description={`${rows.length} shown`}>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Search name, code, dept" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Include former
          </label>
          <Button onClick={() => setOpen(true)}>Add employee</Button>
        </div>
      </PageHeader>
      {q.error && <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Login</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell>
                    <Link href={`/hr/employees/${e.id}`} className="font-medium hover:underline">{e.full_name}</Link>
                    <div className="text-xs text-muted-foreground">{e.designation ?? e.email}</div>
                  </TableCell>
                  <TableCell>{e.employee_code ?? '—'}</TableCell>
                  <TableCell>{e.department ?? '—'}</TableCell>
                  <TableCell>{e.staff_type === 'non_teaching' ? 'Non-teaching' : 'Faculty'}</TableCell>
                  <TableCell><Badge variant={e.status === 'active' ? 'default' : 'outline'}>{e.status}</Badge></TableCell>
                  <TableCell>{e.user_id ? 'Yes' : <span className="text-muted-foreground">No</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
          <EmployeeForm
            initial={EMPTY_EMPLOYEE}
            submitLabel="Create"
            busy={create.isPending}
            error={create.error ? (create.error as Error).message : null}
            onSubmit={(f) => create.mutate(f)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
