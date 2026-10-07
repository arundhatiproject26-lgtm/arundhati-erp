import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, requireRole } from '@/lib/auth';

// GET ?year=&month= → that month's payslips with the employee. Read-only.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const p = request.nextUrl.searchParams;
    const now = new Date();
    const year = Number(p.get('year')) || now.getFullYear();
    const month = Number(p.get('month')) || now.getMonth() + 1;
    const payslips = await db
      .selectFrom('payslips as s')
      .innerJoin('employees as e', 'e.id', 's.employee_id')
      .selectAll('s')
      .select(['e.full_name', 'e.employee_code', 'e.department'])
      .where('s.pay_year', '=', year)
      .where('s.pay_month', '=', month)
      .orderBy('e.full_name')
      .execute();
    return NextResponse.json({ year, month, payslips });
  } catch (err) {
    return errorResponse(err);
  }
}
