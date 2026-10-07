import { NextRequest, NextResponse } from 'next/server';
import { getMe, errorResponse } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    return NextResponse.json(await getMe(request));
  } catch (err) {
    return errorResponse(err);
  }
}
