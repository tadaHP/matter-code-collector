import { NextRequest, NextResponse } from 'next/server';
import { login, setSessionCookie } from '@/server/auth/session';
import { jsonError, validationError } from '@/server/http';
import { loginSchema, parseJson } from '@/server/validation/schemas';

export async function POST(request: NextRequest) {
  try {
    const parsed = parseJson(loginSchema, await request.json());

    if (!parsed.ok) return validationError(parsed.errors);

    const result = await login(parsed.data.username, parsed.data.password);

    if (!result) {
      return NextResponse.json({ message: '로그인 정보를 확인해 주세요.' }, { status: 401 });
    }

    const response = NextResponse.json({ user: result.user });
    setSessionCookie(response, result.token);

    return response;
  } catch (error) {
    return jsonError(error);
  }
}
