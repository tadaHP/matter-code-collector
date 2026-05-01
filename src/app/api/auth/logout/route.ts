import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, logout } from '@/server/auth/session';
import { jsonError } from '@/server/http';

export async function POST(request: NextRequest) {
  try {
    logout(request);

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
