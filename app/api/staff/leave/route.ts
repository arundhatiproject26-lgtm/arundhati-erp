import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireEmployee } from '@/lib/auth';
import { checkRequest, daysByYear, initialStatus, requestedDays, LEAVE_TYPES } from '@/lib/leave-flow';
import { availableFor, overlapsExisting } from '@/lib/leave-service';

// GET → the caller's own leave requests, newest first.
export async function GET(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    const requests = await db
      .selectFrom('leave_requests')
      .selectAll()
      .where('employee_id', '=', me.employee.id)
      .orderBy('created_at', 'desc')
      .limit(200)
      .execute();
    return NextResponse.json({ requests });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  leave_type: z.enum(Object.keys(LEAVE_TYPES) as [string, ...string[]]),
  from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_half_day: z.boolean().default(false),
  session: z.enum(['FN', 'AN']).nullable().optional(),
  reason: z.string().trim().min(3, 'Give a reason').max(1000),
});

// POST → apply. Starts at the step the applicant's own role skips to.
export async function POST(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request');
    const b = parsed.data;
    if (b.is_half_day && !b.session) throw new HttpError(400, 'Choose forenoon or afternoon for a half day.');

    const req = { type: b.leave_type, from: b.from_date, to: b.to_date, halfDay: b.is_half_day };
    // Dates/type first (no balances): a bad range is a 400 before any query.
    const shape = checkRequest({ ...req, available: new Map() });
    if (shape) throw new HttpError(400, shape);
    const years = [...daysByYear(b.from_date, b.to_date, b.is_half_day).keys()];
    const problem = checkRequest({ ...req, available: await availableFor(me.employee.id, b.leave_type, years) });
    if (problem) throw new HttpError(400, problem);
    if (await overlapsExisting(me.employee.id, b.from_date, b.to_date)) {
      throw new HttpError(409, 'You already have leave on one of these dates.');
    }
    // ponytail: balance check and insert are not one transaction; two
    // simultaneous submissions could overdraw by one request. Lock the
    // employee row (select … for update) if that ever matters.

    const created = await db
      .insertInto('leave_requests')
      .values({
        employee_id: me.employee.id,
        leave_type: b.leave_type,
        from_date: b.from_date,
        to_date: b.to_date,
        is_half_day: b.is_half_day,
        session: b.is_half_day ? b.session! : null,
        days: requestedDays(b.from_date, b.to_date, b.is_half_day),
        reason: b.reason,
        status: initialStatus(me.roles),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return NextResponse.json({ request: created }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}
