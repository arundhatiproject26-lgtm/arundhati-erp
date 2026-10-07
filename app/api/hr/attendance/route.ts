import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';
import { employeeAttendance, isMonth } from '@/lib/attendance-service';
import { todayIST } from '@/lib/format';

const isDate = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

// GET ?employee_id=&month=YYYY-MM → one employee's derived month
// GET ?date=YYYY-MM-DD            → every punch row imported for that day
// GET                             → imported days, newest first
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const p = request.nextUrl.searchParams;

    const employeeId = p.get('employee_id');
    if (employeeId) {
      const emp = await db.selectFrom('employees').select(['id', 'employee_code', 'user_id', 'full_name'])
        .where('id', '=', employeeId).executeTakeFirst();
      if (!emp) throw new HttpError(404, 'Employee not found');
      const m = p.get('month');
      const month = isMonth(m) ? m : todayIST().slice(0, 7);
      const result = await employeeAttendance(emp, month);
      return NextResponse.json({ month, employee: emp, ...(result ?? { rows: [], summary: null }) });
    }

    const date = p.get('date');
    if (date) {
      if (!isDate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
      const records = await db
        .selectFrom('staff_punch as p')
        .leftJoin('employees as e', 'e.employee_code', 'p.employee_code')
        .select(['p.id', 'p.employee_code', 'p.employee_name', 'p.punch_in', 'p.punch_out', 'p.status', 'p.department', 'e.id as employee_id', 'e.full_name'])
        .where('p.punch_date', '=', date)
        .orderBy('p.employee_code')
        .execute();
      return NextResponse.json({ date, records });
    }

    const days = await db.selectFrom('staff_punch_days').selectAll().orderBy('punch_date', 'desc').limit(120).execute();
    return NextResponse.json({ days });
  } catch (err) {
    return errorResponse(err);
  }
}
