import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { deleteDevice, getDevice, updateDevice } from '@/server/db/repositories';
import { jsonError, validationError } from '@/server/http';
import { deviceSchema, parseJson } from '@/server/validation/schemas';

export async function GET(request: NextRequest, context: RouteContext<'/api/devices/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;
    const device = getDevice(id);

    if (!device) {
      return NextResponse.json({ message: '기기를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ device });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/devices/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseJson(deviceSchema, await request.json());
    if (!parsed.ok) return validationError(parsed.errors);

    const { id } = await context.params;
    const device = updateDevice(id, parsed.data);

    if (!device) {
      return NextResponse.json({ message: '기기를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ device });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext<'/api/devices/[id]'>) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const { id } = await context.params;

    if (!deleteDevice(id)) {
      return NextResponse.json({ message: '기기를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
