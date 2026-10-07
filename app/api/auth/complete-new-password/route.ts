import { NextRequest, NextResponse } from 'next/server';
import { completeNewPassword } from '@/lib/cognito-admin';

export async function POST(request: NextRequest) {
  try {
    const { email, session, newPassword } = await request.json();
    if (!email || !session || !newPassword) {
      return NextResponse.json({ error: 'email, session and newPassword are required' }, { status: 400 });
    }
    return NextResponse.json(await completeNewPassword(email, session, newPassword));
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    if (name === 'InvalidPasswordException') {
      return NextResponse.json({ error: 'Password does not meet the requirements (8+ chars, upper, lower, number, symbol)' }, { status: 400 });
    }
    if (name === 'NotAuthorizedException' || name === 'CodeMismatchException') {
      return NextResponse.json({ error: 'Session expired — please sign in again' }, { status: 401 });
    }
    console.error('complete-new-password error:', err);
    return NextResponse.json({ error: 'Could not set password' }, { status: 500 });
  }
}
