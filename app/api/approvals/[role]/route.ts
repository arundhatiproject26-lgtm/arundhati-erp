import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireRole } from '@/lib/auth';
import { STEP } from '@/lib/leave-flow';
import { parseApproverRole, requestsWithApplicant } from '@/lib/approvals';

// GET → { queue: requests waiting at this step, recent: ones this approver decided }
export async function GET(request: NextRequest, ctx: RouteContext<'/api/approvals/[role]'>) {
  try {
    const role = parseApproverRole((await ctx.params).role);
    const me = await requireRole(request, role);

    let queue = requestsWithApplicant().where('lr.status', '=', STEP[role].from);
    if (role === 'hod') {
      queue = queue.where((eb) => eb(eb.fn('lower', ['e.department']), '=', (me.hodDepartment ?? '').toLowerCase()));
    }
    // Nobody sees their own request as actionable.
    queue = queue.where((eb) => eb.or([eb('e.user_id', 'is', null), eb('e.user_id', '!=', me.userId)]));

    const byCol = `lr.${role}_by` as 'lr.hod_by' | 'lr.principal_by' | 'lr.dean_by';
    const atCol = `lr.${role}_at` as 'lr.hod_at' | 'lr.principal_at' | 'lr.dean_at';
    const [pending, recent] = await Promise.all([
      queue.orderBy('lr.from_date').execute(),
      requestsWithApplicant().where(byCol, '=', me.userId).orderBy(atCol, 'desc').limit(30).execute(),
    ]);
    // A dean's own leave is finalised by the principal, so it never shows to the dean.
    const queueRows = role === 'dean' ? pending.filter((r) => !r.applicant_is_dean) : pending;
    return NextResponse.json({ queue: queueRows, recent, department: me.hodDepartment });
  } catch (err) {
    return errorResponse(err);
  }
}
