// Pure: who a signed-in user is allowed to be, from their role rows and
// employee row. Kept out of lib/auth.ts so it can be checked without a DB.
import { ROLE_ORDER, type Role } from './roles.ts';

export const CURRENT_STATUSES = ['active', 'on-leave'] as const;

export interface AccessEmployee {
  id: string;
  full_name: string;
  email: string;
  employee_code: string | null;
  department: string | null;
  designation: string | null;
  staff_type: string;
  status: string;
}

export interface Access<E extends AccessEmployee = AccessEmployee> {
  roles: Role[];
  hodDepartment: string | null;
  employee: E | null;
}

/**
 * Every current employee gets the staff portal implicitly. A resigned or
 * terminated employee whose login still exists gets nothing — not staff, and
 * none of their stored HOD/Principal/Dean/HR roles either.
 */
export function effectiveAccess<E extends AccessEmployee>(
  roleRows: { role: string; department: string | null }[],
  employee: E | null,
): Access<E> {
  if (employee && !(CURRENT_STATUSES as readonly string[]).includes(employee.status)) {
    return { roles: [], hodDepartment: null, employee: null };
  }
  const roles = new Set(roleRows.map((r) => r.role));
  if (employee) roles.add('staff');
  return {
    roles: ROLE_ORDER.filter((r) => roles.has(r)),
    hodDepartment: roleRows.find((r) => r.role === 'hod')?.department ?? null,
    employee,
  };
}

/**
 * Linking a login to an employee row by email is only safe when Cognito has
 * verified that the user owns the address; otherwise anyone could claim a
 * colleague's record by signing up with their email.
 */
export function canAutoLink(email: string | null, emailVerified: boolean): email is string {
  return Boolean(email) && emailVerified;
}
