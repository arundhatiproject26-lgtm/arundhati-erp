import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireEmployee } from '@/lib/auth';
import { todayIST } from '@/lib/format';

export async function GET(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    const rows = await db.selectFrom('regularizations').selectAll()
      .where('employee_id', '=', me.employee.id)
      .orderBy('created_at', 'desc').limit(100).execute();
    return NextResponse.json({ regularizations: rows });
  } catch (err) {
    return errorResponse(err);
  }
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times must be HH:MM');
const Body = z.object({
  punch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  requested_in: time,
  requested_out: time,
  reason: z.string().trim().min(3, 'Give a reason').max(1000),
});

// POST → ask HR to correct a past day's punches.
export async function POST(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    if (!me.employee.employee_code) throw new HttpError(400, 'No biometric code is set for you. Contact HR.');
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
    const b = parsed.data;
    if (b.punch_date > todayIST()) throw new HttpError(400, 'You can only regularize a past day.');
    if (b.requested_out <= b.requested_in) throw new HttpError(400, 'Out time must be after in time.');

    try {
      const row = await db.insertInto('regularizations')
        .values({ employee_id: me.employee.id, ...b })
        .returningAll().executeTakeFirstOrThrow();
      return NextResponse.json({ regularization: row }, { status: 201 });
    } catch (e) {
      // regularizations_one_pending: one open request per day.
      if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'You already have a pending request for this day.');
      throw e;
    }
  } catch (err) {
    return errorResponse(err);
  }
}
