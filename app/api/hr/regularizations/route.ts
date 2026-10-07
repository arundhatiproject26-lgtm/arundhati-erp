import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';

// GET ?status=pending|approved|rejected (default pending)
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const s = request.nextUrl.searchParams.get('status') ?? 'pending';
    const status = ['pending', 'approved', 'rejected'].includes(s) ? s : 'pending';
    const rows = await db
      .selectFrom('regularizations as r')
      .innerJoin('employees as e', 'e.id', 'r.employee_id')
      .leftJoin('staff_punch as p', (j) => j.onRef('p.employee_code', '=', 'e.employee_code').onRef('p.punch_date', '=', 'r.punch_date'))
      .selectAll('r')
      .select(['e.full_name', 'e.employee_code', 'e.department', 'p.punch_in as current_in', 'p.punch_out as current_out', 'p.status as current_status'])
      .where('r.status', '=', status)
      .orderBy('r.punch_date', 'desc')
      .limit(200)
      .execute();
    return NextResponse.json({ regularizations: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  id: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().max(1000).optional(),
});

// PATCH { id, decision, remarks } → approving rewrites that day's punch row
// as "Present (Regularized)" with the requested times, in one transaction.
export async function PATCH(request: NextRequest) {
  try {
    const me = await requireRole(request, 'hr');
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, 'Invalid request');
    const { id, decision, remarks } = parsed.data;

    const result = await db.transaction().execute(async (trx) => {
      const reg = await trx
        .updateTable('regularizations')
        .set({ status: decision, reviewed_by: me.userId, reviewed_at: new Date(), remarks: remarks ?? null })
        .where('id', '=', id)
        .where('status', '=', 'pending')
        .returningAll()
        .executeTakeFirst();
      if (!reg) throw new HttpError(409, 'This request was already decided.');
      if (decision === 'rejected') return reg;

      const emp = await trx.selectFrom('employees').select(['employee_code', 'full_name', 'department', 'user_id'])
        .where('id', '=', reg.employee_id).executeTakeFirstOrThrow();
      if (!emp.employee_code) throw new HttpError(400, 'This employee has no biometric code.');
      await trx
        .insertInto('staff_punch')
        .values({
          employee_code: emp.employee_code,
          employee_name: emp.full_name,
          department: emp.department,
          user_id: emp.user_id,
          punch_date: reg.punch_date,
          punch_in: reg.requested_in,
          punch_out: reg.requested_out,
          status: 'Present (Regularized)',
        })
        .onConflict((oc) => oc.columns(['employee_code', 'punch_date']).doUpdateSet({
          punch_in: reg.requested_in,
          punch_out: reg.requested_out,
          status: 'Present (Regularized)',
        }))
        .execute();
      return reg;
    });
    return NextResponse.json({ regularization: result });
  } catch (err) {
    return errorResponse(err);
  }
}
