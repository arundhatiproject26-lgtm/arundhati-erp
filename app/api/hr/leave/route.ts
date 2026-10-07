import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireRole } from '@/lib/auth';
import { requestsWithApplicant } from '@/lib/approvals';

// GET ?month=YYYY-MM&department=… → Dean-approved leave overlapping that month.
// HR sees leave only once the whole chain has approved it.
export async function GET(request: NextRequest) {
  try {
    await requireRole(request, 'hr');
    const params = request.nextUrl.searchParams;
    const month = /^\d{4}-\d{2}$/.test(params.get('month') ?? '') ? params.get('month')! : new Date().toISOString().slice(0, 7);
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

    let q = requestsWithApplicant()
      .where('lr.status', '=', 'approved')
      .where('lr.from_date', '<=', to)
      .where('lr.to_date', '>=', from);
    const dept = params.get('department');
    if (dept) q = q.where('e.department', '=', dept);
    const rows = await q.orderBy('lr.from_date').orderBy('e.full_name').execute();
    return NextResponse.json({ month, requests: rows });
  } catch (err) {
    return errorResponse(err);
  }
}
