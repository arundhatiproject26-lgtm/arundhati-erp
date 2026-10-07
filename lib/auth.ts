// Server-side request auth: verify the Cognito ID token, then load roles and
// the caller's employee row. Every API route goes through getMe/requireRole.
import { NextResponse, type NextRequest } from 'next/server';
import { jwtVerify, createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';
import { db } from '@/lib/db';
import type { Role } from '@/lib/roles';
import { canAutoLink, effectiveAccess } from '@/lib/access';

export type { Role };


export interface MeEmployee {
  id: string;
  full_name: string;
  email: string;
  employee_code: string | null;
  department: string | null;
  designation: string | null;
  staff_type: string;
  status: string;
}

export interface Me {
  userId: string;
  email: string | null;
  roles: Role[];
  /** Department a HOD approves leave for. */
  hodDepartment: string | null;
  employee: MeEmployee | null;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
  console.error(err);
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

let jwks: JWTVerifyGetKey | null = null;
function getJwks(): { keys: JWTVerifyGetKey; issuer: string } {
  const poolId = process.env.COGNITO_USER_POOL_ID;
  const region = process.env.COGNITO_REGION;
  if (!poolId || !region) throw new Error('Missing COGNITO_USER_POOL_ID or COGNITO_REGION');
  const issuer = `https://cognito-idp.${region}.amazonaws.com/${poolId}`;
  // jose caches the key set and refetches on an unknown `kid`.
  jwks ??= createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
  return { keys: jwks, issuer };
}

async function verifyToken(request: NextRequest): Promise<{ sub: string; email: string | null; emailVerified: boolean }> {
  const header = request.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new HttpError(401, 'Unauthorized');
  const { keys, issuer } = getJwks();
  try {
    const { payload } = await jwtVerify(token, keys, {
      issuer,
      audience: process.env.COGNITO_APP_CLIENT_ID,
    });
    if (payload.token_use !== 'id' || typeof payload.sub !== 'string') throw new Error('not an id token');
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email.toLowerCase() : null,
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
    };
  } catch {
    throw new HttpError(401, 'Unauthorized');
  }
}

const EMPLOYEE_COLUMNS = ['id', 'full_name', 'email', 'employee_code', 'department', 'designation', 'staff_type', 'status'] as const;

export async function getMe(request: NextRequest): Promise<Me> {
  const { sub, email, emailVerified } = await verifyToken(request);

  const [roleRows, byId] = await Promise.all([
    db.selectFrom('user_roles').select(['role', 'department']).where('user_id', '=', sub).execute(),
    db.selectFrom('employees').select(EMPLOYEE_COLUMNS).where('user_id', '=', sub).executeTakeFirst(),
  ]);

  let employee: MeEmployee | null = byId ?? null;
  // HR may have added the employee before the login existed: match by
  // (verified) email once and link it, so later lookups go by user_id.
  if (!employee && canAutoLink(email, emailVerified)) {
    const linked = await db
      .updateTable('employees')
      .set({ user_id: sub })
      .where('email', '=', email)
      .where('user_id', 'is', null)
      .returning(EMPLOYEE_COLUMNS)
      .executeTakeFirst();
    employee = linked ?? null;
  }

  // Resigned/terminated employees lose every portal, approver roles included.
  return { userId: sub, email, ...effectiveAccess(roleRows, employee) };
}

export async function requireRole(request: NextRequest, role: Role): Promise<Me> {
  const me = await getMe(request);
  if (!me.roles.includes(role)) throw new HttpError(403, 'Forbidden');
  return me;
}

/** For staff-only routes that need the caller's employee row. */
export async function requireEmployee(request: NextRequest): Promise<Me & { employee: MeEmployee }> {
  const me = await getMe(request);
  if (!me.employee) throw new HttpError(403, 'No employee record is linked to this login. Contact HR.');
  return me as Me & { employee: MeEmployee };
}
