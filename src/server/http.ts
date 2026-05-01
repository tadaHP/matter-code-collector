import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ConflictError, ValidationError } from './db/repositories';

export function jsonError(error: unknown) {
  if (error instanceof ConflictError || error instanceof ValidationError) {
    return NextResponse.json({ message: error.message }, { status: error.status });
  }

  if (error instanceof ZodError) {
    return NextResponse.json({ message: '입력값을 확인해 주세요.', errors: error.flatten().fieldErrors }, { status: 400 });
  }

  return NextResponse.json({ message: '요청을 처리하지 못했습니다.' }, { status: 500 });
}

export function validationError(errors: Record<string, string[] | undefined>) {
  return NextResponse.json({ message: '입력값을 확인해 주세요.', errors }, { status: 400 });
}
