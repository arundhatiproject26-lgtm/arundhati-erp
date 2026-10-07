import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireEmployee } from '@/lib/auth';
import { employeeAttendance, isMonth } from '@/lib/attendance-service';
import { todayIST } from '@/lib/format';

// GET ?month=YYYY-MM → the caller's own derived attendance. Read-only: punches
// come from HR's biometric upload.
export async function GET(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    const m = request.nextUrl.searchParams.get('month');
    const month = isMonth(m) ? m : todayIST().slice(0, 7);
    const result = await employeeAttendance({ ...me.employee, user_id: me.userId }, month);
    return NextResponse.json({ month, employee_code: me.employee.employee_code, ...(result ?? { rows: [], summary: null }) });
  } catch (err) {
    return errorResponse(err);
  }
}
