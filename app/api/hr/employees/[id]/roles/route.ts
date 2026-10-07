import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';

const Body = z.object({
  roles: z.array(z.object({
    role: z.enum(['hod', 'principal', 'dean', 'hr']),
    department: z.string().trim().max(200).nullish(),
  })).max(4),
});

// PUT { roles } → replace the employee's extra portal roles. Staff access is
// implicit for every employee and is never stored.
export async function PUT(request: NextRequest, ctx: RouteContext<'/api/hr/employees/[id]/roles'>) {
  try {
    const me = await requireRole(request, 'hr');
    const { id } = await ctx.params;
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, 'Invalid roles');
    const roles = parsed.data.roles;
    if (roles.some((r) => r.role === 'hod' && !r.department)) throw new HttpError(400, 'A HOD needs a department.');

    const emp = await db.selectFrom('employees').select(['user_id']).where('id', '=', id).executeTakeFirst();
    if (!emp) throw new HttpError(404, 'Employee not found');
    if (!emp.user_id) throw new HttpError(400, 'Create a login for this employee first.');
    // Don't let HR lock themselves out of the HR portal.
    if (emp.user_id === me.userId && !roles.some((r) => r.role === 'hr')) {
      throw new HttpError(400, 'You cannot remove your own HR access.');
    }

    const userId = emp.user_id;
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom('user_roles').where('user_id', '=', userId).execute();
      if (roles.length) {
        await trx.insertInto('user_roles')
          .values(roles.map((r) => ({ user_id: userId, role: r.role, department: r.role === 'hod' ? r.department ?? null : null })))
          .execute();
      }
    });
    return NextResponse.json({ roles });
  } catch (err) {
    return errorResponse(err);
  }
}
