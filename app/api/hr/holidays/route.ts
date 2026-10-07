import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';

// GET ?year= → declared holidays and reduced-timing days.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const year = Number(request.nextUrl.searchParams.get('year')) || new Date().getFullYear();
    const holidays = await db.selectFrom('attendance_holidays').selectAll()
      .where('holiday_date', '>=', `${year}-01-01`).where('holiday_date', '<=', `${year}-12-31`)
      .orderBy('holiday_date').execute();
    return NextResponse.json({ year, holidays });
  } catch (err) {
    return errorResponse(err);
  }
}

const Body = z.object({
  holiday_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().trim().min(1).max(200),
  day_type: z.enum(['holiday', 'reduced_timing']).default('holiday'),
});

export async function POST(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, 'Give a date and a name');
    const h = parsed.data;
    await db.insertInto('attendance_holidays').values(h)
      .onConflict((oc) => oc.column('holiday_date').doUpdateSet({ name: h.name, day_type: h.day_type }))
      .execute();
    return NextResponse.json({ holiday: h }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

// DELETE ?date=YYYY-MM-DD
export async function DELETE(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const date = request.nextUrl.searchParams.get('date');
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
    await db.deleteFrom('attendance_holidays').where('holiday_date', '=', date).execute();
    return NextResponse.json({ deleted: date });
  } catch (err) {
    return errorResponse(err);
  }
}
