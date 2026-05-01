import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { createDevice, listDevices } from '@/server/db/repositories';
import { jsonError, validationError } from '@/server/http';
import { deviceSchema, parseJson } from '@/server/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const searchParams = request.nextUrl.searchParams;

    return NextResponse.json({
      devices: listDevices({
        q: searchParams.get('q') ?? undefined,
        location: searchParams.get('location') ?? undefined,
        tagId: searchParams.get('tagId') ?? undefined,
        sort: searchParams.get('sort') ?? undefined,
      }),
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseJson(deviceSchema, await request.json());
    if (!parsed.ok) return validationError(parsed.errors);

    return NextResponse.json({ device: createDevice(parsed.data) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
