import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { createLocation, listLocations } from '@/server/db/repositories';
import { jsonError, validationError } from '@/server/http';
import { locationSchema, parseJson } from '@/server/validation/schemas';

export async function GET(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    return NextResponse.json({ locations: listLocations() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const parsed = parseJson(locationSchema, await request.json());
    if (!parsed.ok) return validationError(parsed.errors);

    return NextResponse.json({ location: createLocation(parsed.data.name) }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
