import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { deleteTag, updateTag } from '@/server/db/repositories';
import { jsonError, validationError } from '@/server/http';
import { parseJson, tagSchema } from '@/server/validation/schemas';

export async function PATCH(request: NextRequest, context: RouteContext<'/api/tags/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseJson(tagSchema, await request.json());
    if (!parsed.ok) return validationError(parsed.errors);

    const { id } = await context.params;
    const tag = updateTag(id, parsed.data.name);

    if (!tag) {
      return NextResponse.json({ message: '태그를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ tag });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/tags/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;

    if (!deleteTag(id)) {
      return NextResponse.json({ message: '태그를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
