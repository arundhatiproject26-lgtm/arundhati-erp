import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';
import { canDecide, nextStatus, STEP, type LeaveStatus } from '@/lib/leave-flow';
import { parseApproverRole, requestsWithApplicant } from '@/lib/approvals';

const Body = z.object({
  decision: z.enum(['approved', 'rejected']),
  remarks: z.string().trim().max(1000).optional(),
});

// PATCH → approve/reject at this approver's step.
export async function PATCH(request: NextRequest, ctx: RouteContext<'/api/approvals/[role]/[id]'>) {
  try {
    const { role: rawRole, id } = await ctx.params;
    const role = parseApproverRole(rawRole);
    const me = await requireRole(request, role);
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, 'decision must be approved or rejected');
    const { decision, remarks } = parsed.data;
    if (decision === 'rejected' && !remarks) throw new HttpError(400, 'Give a reason for rejecting.');

    const req = await requestsWithApplicant().where('lr.id', '=', id).executeTakeFirst();
    if (!req) throw new HttpError(404, 'Request not found');

    const problem = canDecide({
      approverRole: role,
      approverUserId: me.userId,
      approverDept: me.hodDepartment,
      applicantUserId: req.applicant_user_id,
      applicantDept: req.department,
      applicantIsDean: Boolean(req.applicant_is_dean),
      status: req.status as LeaveStatus,
    });
    if (problem) throw new HttpError(problem.includes('department') || problem.includes('own') ? 403 : 409, problem);

    // Conditional on the status we just read: if someone else moved it in
    // between, nothing updates and the caller gets 409 instead of a double step.
    const updated = await db
      .updateTable('leave_requests')
      .set({
        status: nextStatus(role, decision, Boolean(req.applicant_is_dean)),
        [`${role}_by`]: me.userId,
        [`${role}_at`]: new Date(),
        [`${role}_remarks`]: remarks ?? null,
      })
      .where('id', '=', id)
      .where('status', '=', STEP[role].from)
      .returning(['id', 'status'])
      .executeTakeFirst();
    if (!updated) throw new HttpError(409, 'This request was just actioned by someone else.');
    return NextResponse.json({ request: updated });
  } catch (err) {
    return errorResponse(err);
  }
}
