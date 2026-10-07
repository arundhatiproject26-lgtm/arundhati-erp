// One employee's month of biometric attendance, with HR policy applied.
import { db } from '@/lib/db';
import { deriveAttendance, HOD_PUNCTUALITY_ALLOWANCE, PUNCTUALITY_ALLOWANCE } from '@/lib/hr-attendance';
import { approvedLeaveCoverage } from '@/lib/leave-service';

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) };
}

export const isMonth = (v: string | null): v is string => Boolean(v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v));

export async function employeeAttendance(
  employee: { id: string; employee_code: string | null; user_id?: string | null },
  month: string,
) {
  if (!employee.employee_code) return null;
  const { from, to } = monthRange(month);

  const [punches, holidays, leave, hodRole] = await Promise.all([
    db.selectFrom('staff_punch')
      .select(['id', 'punch_date', 'punch_in', 'punch_out', 'status', 'work_duration', 'overtime', 'total_duration'])
      .where('employee_code', '=', employee.employee_code)
      .where('punch_date', '>=', from)
      .where('punch_date', '<=', to)
      .orderBy('punch_date', 'desc')
      .execute(),
    db.selectFrom('attendance_holidays').selectAll()
      .where('holiday_date', '>=', from).where('holiday_date', '<=', to).execute(),
    approvedLeaveCoverage(employee.id, from, to),
    employee.user_id
      ? db.selectFrom('user_roles').select('role').where('user_id', '=', employee.user_id).where('role', '=', 'hod').executeTakeFirst()
      : Promise.resolve(undefined),
  ]);

  return deriveAttendance(
    punches,
    holidays.filter((h) => h.day_type === 'holiday').map((h) => h.holiday_date),
    holidays.filter((h) => h.day_type === 'reduced_timing').map((h) => h.holiday_date),
    leave,
    hodRole ? HOD_PUNCTUALITY_ALLOWANCE : PUNCTUALITY_ALLOWANCE,
  );
}
