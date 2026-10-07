import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';
import { LEAVE_TYPES } from '@/lib/leave-flow';
import { balancesFor } from '@/lib/leave-service';

// GET ?year=&employee_id= → one employee's balance lines,
// or with no employee_id → every allocation row for the year.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const p = request.nextUrl.searchParams;
    const year = Number(p.get('year')) || new Date().getFullYear();
    const employeeId = p.get('employee_id');
    if (employeeId) return NextResponse.json({ year, balances: await balancesFor(employeeId, year) });
    const rows = await db.selectFrom('leave_balances').selectAll().where('year', '=', year).execute();
    return NextResponse.json({ year, allocations: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  year: z.number().int().min(2000).max(2100),
  leave_type: z.enum(Object.keys(LEAVE_TYPES) as [string, ...string[]]),
  allocated: z.number().min(0).max(365),
  /** One employee, or omit to set it for every active employee. */
  employee_id: z.string().uuid().optional(),
});

// PUT → set an allocation (upsert) for one employee or all active employees.
export async function PUT(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
    const { year, leave_type, allocated, employee_id } = parsed.data;

    const ids = employee_id
      ? [employee_id]
      : (await db.selectFrom('employees').select('id').where('status', 'in', ['active', 'on-leave']).execute()).map((e) => e.id);
    if (ids.length === 0) return NextResponse.json({ updated: 0 });

    await db
      .insertInto('leave_balances')
      .values(ids.map((id) => ({ employee_id: id, year, leave_type, allocated })))
      .onConflict((oc) => oc.columns(['employee_id', 'year', 'leave_type']).doUpdateSet({ allocated }))
      .execute();
    return NextResponse.json({ updated: ids.length });
  } catch (err) {
    return errorResponse(err);
  }
}
