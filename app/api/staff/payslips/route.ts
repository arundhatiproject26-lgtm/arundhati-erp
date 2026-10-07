import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { errorResponse, requireEmployee } from '@/lib/auth';

// GET → the caller's own payslips, newest first. Rows are loaded by HR/finance.
export async function GET(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    const [employee, payslips] = await Promise.all([
      db.selectFrom('employees')
        .select(['full_name', 'employee_code', 'department', 'designation', 'basic_salary', 'hra', 'allowances', 'pf_deduction', 'tax_deduction'])
        .where('id', '=', me.employee.id).executeTakeFirst(),
      db.selectFrom('payslips').selectAll().where('employee_id', '=', me.employee.id)
        .orderBy('pay_year', 'desc').orderBy('pay_month', 'desc').execute(),
    ]);
    return NextResponse.json({ employee, payslips });
  } catch (err) {
    return errorResponse(err);
  }
}
