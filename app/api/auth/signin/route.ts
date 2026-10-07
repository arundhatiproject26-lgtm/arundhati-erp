import { NextRequest, NextResponse } from 'next/server';
import { initiateAuth } from '@/lib/cognito-admin';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    return NextResponse.json(await initiateAuth(email, password));
  } catch (err: unknown) {
    const name = (err as { name?: string })?.name;
    // Same message for both, so the form can't be used to discover accounts.
    if (name === 'UserNotFoundException' || name === 'NotAuthorizedException') {
      return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 });
    }
    console.error('signin error:', err);
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 });
  }
}
