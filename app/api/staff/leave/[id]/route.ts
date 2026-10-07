import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireEmployee } from '@/lib/auth';
import { IN_FLIGHT } from '@/lib/leave-flow';

// PATCH → cancel the caller's own request while it is still in flight.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/staff/leave/[id]'>) {
  try {
    const me = await requireEmployee(request);
    const { id } = await ctx.params;
    const row = await db
      .updateTable('leave_requests')
      .set({ status: 'cancelled' })
      .where('id', '=', id)
      .where('employee_id', '=', me.employee.id)
      .where('status', 'in', IN_FLIGHT)
      .returning(['id', 'status'])
      .executeTakeFirst();
    if (!row) throw new HttpError(409, 'Only a request still awaiting approval can be cancelled.');
    return NextResponse.json({ request: row });
  } catch (err) {
    return errorResponse(err);
  }
}
