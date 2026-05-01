import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { deleteLocation, updateLocation } from '@/server/db/repositories';
import { jsonError, validationError } from '@/server/http';
import { locationSchema, parseJson } from '@/server/validation/schemas';

export async function PATCH(request: NextRequest, context: RouteContext<'/api/locations/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseJson(locationSchema, await request.json());
    if (!parsed.ok) return validationError(parsed.errors);

    const { id } = await context.params;
    const location = updateLocation(id, parsed.data.name);

    if (!location) {
      return NextResponse.json({ message: '위치를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ location });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/locations/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;

    if (!deleteLocation(id)) {
      return NextResponse.json({ message: '위치를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
