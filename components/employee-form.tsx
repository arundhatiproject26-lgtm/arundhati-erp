'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SimpleSelect } from '@/components/simple-select';

export interface EmployeeFields {
  full_name: string;
  email: string;
  employee_code: string;
  department: string;
  designation: string;
  staff_type: string;
  employment_type: string;
  status: string;
  date_of_joining: string;
  phone: string;
  basic_salary: string;
  hra: string;
  allowances: string;
  pf_deduction: string;
  tax_deduction: string;
}

export const EMPTY_EMPLOYEE: EmployeeFields = {
  full_name: '', email: '', employee_code: '', department: '', designation: '',
  staff_type: 'faculty', employment_type: 'full-time', status: 'active', date_of_joining: '', phone: '',
  basic_salary: '0', hra: '0', allowances: '0', pf_deduction: '0', tax_deduction: '0',
};

/** Turn an API employee row (nulls, numeric strings) into form state. */
export function toFields(e: Record<string, unknown>): EmployeeFields {
  const out = { ...EMPTY_EMPLOYEE };
  for (const k of Object.keys(out) as (keyof EmployeeFields)[]) {
    const v = e[k];
    if (v !== null && v !== undefined) out[k] = String(v).slice(0, k === 'date_of_joining' ? 10 : undefined);
  }
  return out;
}

const TEXT: [keyof EmployeeFields, string, string?][] = [
  ['full_name', 'Full name'],
  ['email', 'Email (login)', 'email'],
  ['employee_code', 'Biometric code'],
  ['department', 'Department'],
  ['designation', 'Designation'],
  ['phone', 'Phone', 'tel'],
  ['date_of_joining', 'Date of joining', 'date'],
];
const MONEY: [keyof EmployeeFields, string][] = [
  ['basic_salary', 'Basic'],
  ['hra', 'HRA'],
  ['allowances', 'Allowances'],
  ['pf_deduction', 'PF deduction'],
  ['tax_deduction', 'Tax deduction'],
];

export function EmployeeForm({
  initial, submitLabel, busy, error, onSubmit,
}: {
  initial: EmployeeFields;
  submitLabel: string;
  busy: boolean;
  error: string | null;
  onSubmit: (f: EmployeeFields) => void;
}) {
  const [f, setF] = useState(initial);
  const set = (k: keyof EmployeeFields) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {TEXT.map(([k, label, type]) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={k}>{label}</Label>
            <Input id={k} type={type ?? 'text'} required={k === 'full_name' || k === 'email'} value={f[k]} onChange={(e) => set(k)(e.target.value)} />
          </div>
        ))}
        <div className="space-y-1.5">
          <Label>Staff type</Label>
          <SimpleSelect value={f.staff_type} onChange={set('staff_type')} options={[{ value: 'faculty', label: 'Faculty' }, { value: 'non_teaching', label: 'Non-teaching' }]} />
        </div>
        <div className="space-y-1.5">
          <Label>Employment</Label>
          <SimpleSelect value={f.employment_type} onChange={set('employment_type')} options={['full-time', 'part-time', 'contract', 'visiting'].map((v) => ({ value: v, label: v }))} />
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <SimpleSelect value={f.status} onChange={set('status')} options={['active', 'on-leave', 'resigned', 'terminated'].map((v) => ({ value: v, label: v }))} />
        </div>
      </div>
      <div>
        <div className="mb-2 text-sm font-medium">Monthly salary structure (shown on payslips)</div>
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {MONEY.map(([k, label]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>{label}</Label>
              <Input id={k} type="number" min={0} step="0.01" value={f[k]} onChange={(e) => set(k)(e.target.value)} />
            </div>
          ))}
        </div>
      </div>
      {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : submitLabel}</Button>
    </form>
  );
}
