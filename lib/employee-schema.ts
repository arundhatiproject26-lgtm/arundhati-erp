import { z } from 'zod';

const money = z.coerce.number().min(0).max(100_000_000).default(0);
const optText = z.string().trim().max(200).nullish().transform((v) => v || null);

/** HR's create/edit form. Email lowercased, biometric code uppercased. */
export const EmployeeInput = z.object({
  full_name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  employee_code: optText.transform((v) => (v ? v.toUpperCase() : null)),
  department: optText,
  designation: optText,
  staff_type: z.enum(['faculty', 'non_teaching']).default('faculty'),
  employment_type: z.enum(['full-time', 'part-time', 'contract', 'visiting']).default('full-time'),
  status: z.enum(['active', 'on-leave', 'resigned', 'terminated']).default('active'),
  date_of_joining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().or(z.literal('')).transform((v) => v || null),
  phone: optText,
  basic_salary: money,
  hra: money,
  allowances: money,
  pf_deduction: money,
  tax_deduction: money,
});
export type EmployeeInput = z.infer<typeof EmployeeInput>;

export { CURRENT_STATUSES } from '@/lib/access';
