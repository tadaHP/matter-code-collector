import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { createTag, listTags } from '@/server/db/repositories';
import { jsonError, validationError } from '@/server/http';
import { parseJson, tagSchema } from '@/server/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    return NextResponse.json({ tags: listTags() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseJson(tagSchema, await request.json());
    if (!parsed.ok) return validationError(parsed.errors);

    return NextResponse.json({ tag: createTag(parsed.data.name) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
