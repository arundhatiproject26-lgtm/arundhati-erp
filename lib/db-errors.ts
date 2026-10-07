import { HttpError } from '@/lib/auth';

/** Postgres unique-violation → a readable 409, or null for any other error. */
export function uniqueViolation(e: unknown): HttpError | null {
  const err = e as { code?: string; constraint?: string };
  if (err.code !== '23505') return null;
  if (err.constraint?.includes('email')) return new HttpError(409, 'Another employee already has this email.');
  if (err.constraint?.includes('employee_code')) return new HttpError(409, 'Another employee already has this biometric code.');
  return new HttpError(409, 'Duplicate value.');
}
