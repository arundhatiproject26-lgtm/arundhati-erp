import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { errorResponse, HttpError, requireRole } from '@/lib/auth';
import { createOrResetLogin } from '@/lib/cognito-admin';

const Body = z.object({
  // Cognito's default policy: 8+ chars with upper, lower, number and symbol.
  temp_password: z.string().min(8, 'Temporary password must be at least 8 characters').max(128),
});

// POST → create the employee's Cognito login, or reset it to a new temporary
// password. Either way they must set their own password on next sign-in.
export async function POST(request: NextRequest, ctx: RouteContext<'/api/hr/employees/[id]/login'>) {
  try {
    await requireRole(request, 'hr');
    const { id } = await ctx.params;
    const parsed = Body.safeParse(await request.json());
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid request');

    const emp = await db.selectFrom('employees').select(['id', 'email', 'full_name', 'user_id']).where('id', '=', id).executeTakeFirst();
    if (!emp) throw new HttpError(404, 'Employee not found');

    let login;
    try {
      login = await createOrResetLogin(emp.email, parsed.data.temp_password, emp.full_name);
    } catch (e) {
      if ((e as { name?: string }).name === 'InvalidPasswordException') {
        throw new HttpError(400, 'Temporary password needs upper and lower case letters, a number and a symbol.');
      }
      throw e;
    }

    if (emp.user_id !== login.sub) {
      try {
        await db.updateTable('employees').set({ user_id: login.sub }).where('id', '=', id).execute();
      } catch (e) {
        if ((e as { code?: string }).code === '23505') throw new HttpError(409, 'This login is already linked to another employee.');
        throw e;
      }
    }
    return NextResponse.json({ created: login.isNew, user_id: login.sub });
  } catch (err) {
    return errorResponse(err);
  }
}
