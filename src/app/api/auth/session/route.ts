import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/server/auth/session';
import { jsonError } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const user = getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 });
    }

    return NextResponse.json({ user });
  } catch (error) {
    return jsonError(error);
  }
}
