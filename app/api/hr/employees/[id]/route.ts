import { NextRequest, NextResponse } from 'next/server';
import { db, sql } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';
import { EmployeeInput } from '@/lib/employee-schema';
import { uniqueViolation } from '@/lib/db-errors';

// GET → employee + their portal roles.
export async function GET(request: NextRequest, ctx: RouteContext<'/api/hr/employees/[id]'>) {
  try {
    await requireRole(request, 'hr');
    const { id } = await ctx.params;
    const employee = await db.selectFrom('employees').selectAll().where('id', '=', id).executeTakeFirst();
    if (!employee) throw new HttpError(404, 'Employee not found');
    const roles = employee.user_id
      ? await db.selectFrom('user_roles').select(['role', 'department']).where('user_id', '=', employee.user_id).execute()
      : [];
    return NextResponse.json({ employee, roles });
  } catch (err) {
    return errorResponse(err);
  }
}

// PATCH → replace the editable fields.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/hr/employees/[id]'>) {
  try {
    await requireRole(request, 'hr');
    const { id } = await ctx.params;
    const parsed = EmployeeInput.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid employee');
    try {
      const row = await db.updateTable('employees')
        .set({ ...parsed.data, updated_at: sql`now()` })
        .where('id', '=', id)
        .returning(['id'])
        .executeTakeFirst();
      if (!row) throw new HttpError(404, 'Employee not found');
      return NextResponse.json({ employee: row });
    } catch (e) {
      throw uniqueViolation(e) ?? e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
