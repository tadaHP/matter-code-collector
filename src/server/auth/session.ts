import bcrypt from 'bcryptjs';
import { randomBytes, createHmac, randomUUID } from 'crypto';
import { eq, lt } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';
import { sessions, users } from '@/server/db/schema';

export const SESSION_COOKIE = 'matter_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type SafeUser = {
  id: string;
  username: string;
  role: string;
};

export async function login(username: string, password: string) {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.username, username)).get();

  if (!user) return null;

  const validPassword = await bcrypt.compare(password, user.passwordHash);

  if (!validPassword) return null;

  const rawToken = randomBytes(32).toString('base64url');
  const now = Date.now();

  db.insert(sessions)
    .values({
      id: randomUUID(),
      userId: user.id,
      tokenHash: hashToken(rawToken),
      createdAt: now,
      expiresAt: now + SESSION_MAX_AGE_SECONDS * 1000,
    })
    .run();

  db.update(users).set({ lastLoginAt: now }).where(eq(users.id, user.id)).run();

  return {
    token: rawToken,
    user: toSafeUser(user),
  };
}

export function logout(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (token) {
    getDb().delete(sessions).where(eq(sessions.tokenHash, hashToken(token))).run();
  }
}

export function getCurrentUser(request: NextRequest) {
  cleanupExpiredSessions();

  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (!token) return null;

  const row = getDb()
    .select({
      userId: users.id,
      username: users.username,
      role: users.role,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, hashToken(token)))
    .get();

  if (!row || row.expiresAt <= Date.now()) return null;

  return {
    id: row.userId,
    username: row.username,
    role: row.role,
  };
}

export function requireUser(request: NextRequest) {
  const user = getCurrentUser(request);

  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ message: '로그인이 필요합니다.' }, { status: 401 }),
    };
  }

  return {
    ok: true as const,
    user,
  };
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: shouldUseSecureSessionCookie(),
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: shouldUseSecureSessionCookie(),
    path: '/',
    maxAge: 0,
  });
}

function cleanupExpiredSessions() {
  getDb().delete(sessions).where(lt(sessions.expiresAt, Date.now())).run();
}

function hashToken(token: string) {
  const secret = getAuthSecret();
  return createHmac('sha256', secret).update(token).digest('hex');
}

function getAuthSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;

  if (process.env.NODE_ENV === 'production') {
    throw new Error('AUTH_SECRET is required in production.');
  }

  return 'development-only-auth-secret';
}

function shouldUseSecureSessionCookie() {
  if (process.env.NODE_ENV !== 'production') return false;

  return process.env.MATTER_COOKIE_TRANSPORT !== 'http-and-https';
}

function toSafeUser(user: { id: string; username: string; role: string }): SafeUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
  };
}
