'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PageHeader } from '@/components/page-header';
import { EmployeeForm, toFields, type EmployeeFields } from '@/components/employee-form';
import { api, postJson } from '@/lib/auth-fetch';

interface Detail {
  employee: Record<string, unknown> & { id: string; full_name: string; email: string; user_id: string | null; department: string | null };
  roles: { role: string; department: string | null }[];
}

const EXTRA_ROLES = [
  { role: 'hod', label: 'HOD (approves own department’s leave)' },
  { role: 'principal', label: 'Principal' },
  { role: 'dean', label: 'Dean' },
  { role: 'hr', label: 'HR' },
] as const;

function LoginCard({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState('');
  const m = useMutation({
    mutationFn: () => postJson<{ created: boolean }>(`/api/hr/employees/${d.employee.id}/login`, { temp_password: pw }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-employee', d.employee.id] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Login</CardTitle>
        <CardDescription>
          {d.employee.user_id ? `Has a login (${d.employee.email}). Setting a new temporary password resets it.` : `No login yet. Username will be ${d.employee.email}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); m.mutate(); }}>
          <Input placeholder="Temporary password" value={pw} onChange={(e) => setPw(e.target.value)} className="w-64" minLength={8} required />
          <Button type="submit" disabled={m.isPending}>{d.employee.user_id ? 'Reset password' : 'Create login'}</Button>
        </form>
        <p className="text-xs text-muted-foreground">8+ characters with upper and lower case, a number and a symbol. They set their own password on first sign-in.</p>
        {m.error && <Alert variant="destructive"><AlertDescription>{(m.error as Error).message}</AlertDescription></Alert>}
        {m.isSuccess && <Alert><AlertDescription>{m.data.created ? 'Login created.' : 'Password reset.'} Share the temporary password with the employee.</AlertDescription></Alert>}
      </CardContent>
    </Card>
  );
}

function RolesCard({ d }: { d: Detail }) {
  const qc = useQueryClient();
  const [roles, setRoles] = useState<Record<string, boolean>>({});
  const [hodDept, setHodDept] = useState('');
  useEffect(() => {
    setRoles(Object.fromEntries(d.roles.map((r) => [r.role, true])));
    setHodDept(d.roles.find((r) => r.role === 'hod')?.department ?? d.employee.department ?? '');
  }, [d]);
  const m = useMutation({
    mutationFn: () => postJson(`/api/hr/employees/${d.employee.id}/roles`, {
      roles: EXTRA_ROLES.filter((r) => roles[r.role]).map((r) => ({ role: r.role, department: r.role === 'hod' ? hodDept : null })),
    }, 'PUT'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['hr-employee', d.employee.id] }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Portal access</CardTitle>
        <CardDescription>Every employee has the Staff portal. Add approver or HR access here.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!d.employee.user_id && <p className="text-sm text-muted-foreground">Create a login first.</p>}
        {EXTRA_ROLES.map((r) => (
          <label key={r.role} className="flex items-center gap-2 text-sm">
            <input type="checkbox" disabled={!d.employee.user_id} checked={Boolean(roles[r.role])} onChange={(e) => setRoles((p) => ({ ...p, [r.role]: e.target.checked }))} />
            {r.label}
          </label>
        ))}
        {roles.hod && <Input placeholder="HOD of department" value={hodDept} onChange={(e) => setHodDept(e.target.value)} className="w-64" />}
        <Button disabled={!d.employee.user_id || m.isPending} onClick={() => m.mutate()}>Save access</Button>
        {m.error && <Alert variant="destructive"><AlertDescription>{(m.error as Error).message}</AlertDescription></Alert>}
        {m.isSuccess && <p className="text-sm text-muted-foreground">Saved.</p>}
      </CardContent>
    </Card>
  );
}

export default function EmployeeDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hr-employee', id], queryFn: () => api<Detail>(`/api/hr/employees/${id}`) });
  const save = useMutation({
    mutationFn: (f: EmployeeFields) => postJson(`/api/hr/employees/${id}`, f, 'PATCH'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hr-employee', id] });
      qc.invalidateQueries({ queryKey: ['hr-employees'] });
    },
  });

  if (q.error) return <Alert variant="destructive"><AlertDescription>{(q.error as Error).message}</AlertDescription></Alert>;
  if (!q.data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const d = q.data;

  return (
    <div className="space-y-6">
      <PageHeader title={d.employee.full_name} description={d.employee.email} />
      <div className="grid gap-4 lg:grid-cols-2">
        <LoginCard d={d} />
        <RolesCard d={d} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
        <CardContent>
          <EmployeeForm
            key={String(d.employee.updated_at)}
            initial={toFields(d.employee)}
            submitLabel="Save changes"
            busy={save.isPending}
            error={save.error ? (save.error as Error).message : null}
            onSubmit={(f) => save.mutate(f)}
          />
          {save.isSuccess && <p className="mt-2 text-sm text-muted-foreground">Saved.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
