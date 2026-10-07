import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';
import { CURRENT_STATUSES, EmployeeInput } from '@/lib/employee-schema';
import { uniqueViolation } from '@/lib/db-errors';

// GET ?all=1 includes resigned/terminated; default lists current staff.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    let q = db.selectFrom('employees')
      .select(['id', 'full_name', 'email', 'employee_code', 'department', 'designation', 'staff_type', 'employment_type', 'status', 'user_id'])
      .orderBy('full_name');
    if (!request.nextUrl.searchParams.get('all')) q = q.where('status', 'in', [...CURRENT_STATUSES]);
    return NextResponse.json({ employees: await q.execute() });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const parsed = EmployeeInput.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid employee');
    try {
      const row = await db.insertInto('employees').values(parsed.data).returning(['id']).executeTakeFirstOrThrow();
      return NextResponse.json({ employee: row }, { status: 201 });
    } catch (e) {
      throw uniqueViolation(e) ?? e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
