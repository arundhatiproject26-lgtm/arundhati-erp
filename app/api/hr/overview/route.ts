import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, requireRole } from '@/lib/auth';
import { CURRENT_STATUSES } from '@/lib/employee-schema';
import { IN_FLIGHT } from '@/lib/leave-flow';
import { todayIST } from '@/lib/format';

// GET → headcount, leave pipeline and the latest imported day at a glance.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const [byType, byDept, pipeline, pendingRegs, lastDay] = await Promise.all([
      db.selectFrom('employees').select(['staff_type', db.fn.countAll<string>().as('n')])
        .where('status', 'in', [...CURRENT_STATUSES]).groupBy('staff_type').execute(),
      db.selectFrom('employees').select(['department', db.fn.countAll<string>().as('n')])
        .where('status', 'in', [...CURRENT_STATUSES]).groupBy('department').orderBy('department').execute(),
      db.selectFrom('leave_requests').select(['status', db.fn.countAll<string>().as('n')])
        .where('status', 'in', IN_FLIGHT).groupBy('status').execute(),
      db.selectFrom('regularizations').select(db.fn.countAll<string>().as('n')).where('status', '=', 'pending').executeTakeFirst(),
      db.selectFrom('staff_punch_days').select('punch_date').where('punch_date', '<=', todayIST())
        .orderBy('punch_date', 'desc').limit(1).executeTakeFirst(),
    ]);

    let day: { date: string; present: number; absent: number } | null = null;
    if (lastDay) {
      const rows = await db.selectFrom('staff_punch').select('status').where('punch_date', '=', lastDay.punch_date).execute();
      const absent = rows.filter((r) => (r.status ?? '').toLowerCase().startsWith('absent')).length;
      day = { date: lastDay.punch_date, present: rows.length - absent, absent };
    }

    return NextResponse.json({
      headcount: Object.fromEntries(byType.map((r) => [r.staff_type, Number(r.n)])),
      departments: byDept.map((r) => ({ department: r.department ?? 'No department', count: Number(r.n) })),
      leavePipeline: Object.fromEntries(pipeline.map((r) => [r.status, Number(r.n)])),
      pendingRegularizations: Number(pendingRegs?.n ?? 0),
      lastDay: day,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
