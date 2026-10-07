// Shared query for the HOD / Principal / Dean approval routes.
import { db, sql } from '@/lib/db';
import { HttpError } from '@/lib/auth';
import type { ApproverRole } from '@/lib/leave-flow';

export function parseApproverRole(role: string): ApproverRole {
  if (role === 'hod' || role === 'principal' || role === 'dean') return role;
  throw new HttpError(404, 'Unknown approval queue');
}

/** Leave requests joined with the applicant, plus whether the applicant is a dean. */
export function requestsWithApplicant() {
  return db
    .selectFrom('leave_requests as lr')
    .innerJoin('employees as e', 'e.id', 'lr.employee_id')
    .selectAll('lr')
    .select([
      'e.full_name',
      'e.employee_code',
      'e.department',
      'e.designation',
      'e.staff_type',
      'e.user_id as applicant_user_id',
      sql<boolean>`exists (select 1 from user_roles ur where ur.user_id = e.user_id and ur.role = 'dean')`.as('applicant_is_dean'),
    ]);
}
