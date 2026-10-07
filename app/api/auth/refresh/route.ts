import { NextRequest, NextResponse } from 'next/server';
import { refreshTokens } from '@/lib/cognito-admin';

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();
    if (!refreshToken) return NextResponse.json({ error: 'refreshToken is required' }, { status: 400 });
    return NextResponse.json(await refreshTokens(refreshToken));
  } catch (err: unknown) {
    if ((err as { name?: string })?.name === 'NotAuthorizedException') {
      return NextResponse.json({ error: 'Refresh token invalid or expired' }, { status: 401 });
    }
    console.error('refresh error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
