import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, requireEmployee } from '@/lib/auth';
import { balancesFor } from '@/lib/leave-service';

export async function GET(request: NextRequest) {
  try {
    const me = await requireEmployee(request);
    const year = Number(request.nextUrl.searchParams.get('year')) || new Date().getFullYear();
    return NextResponse.json({ year, balances: await balancesFor(me.employee.id, year) });
  } catch (err) {
    return errorResponse(err);
  }
}
