import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/session';
import { listDevices, listTags } from '@/server/db/repositories';
import { jsonError } from '@/server/http';

export async function GET(request: NextRequest) {
  try {
    const auth = requireUser(request);
    if (!auth.ok) return auth.response;

    const format = request.nextUrl.searchParams.get('format') ?? 'json';
    const devices = listDevices();
    const tags = listTags();

    if (format === 'csv') {
      const csv = toCsv(devices);

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="matter-devices.csv"',
        },
      });
    }

    return new NextResponse(JSON.stringify({ devices, tags }, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="matter-code-collector.json"',
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

function toCsv(devices: ReturnType<typeof listDevices>) {
  const headers = [
    'alias',
    'deviceName',
    'qrPayload',
    'numericCode',
    'manufacturer',
    'model',
    'location',
    'tags',
    'notes',
    'createdAt',
    'updatedAt',
  ];
  const rows = devices.map((device) => [
    device.alias,
    device.deviceName,
    device.qrPayload,
    device.numericCode,
    device.manufacturer,
    device.model,
    device.location,
    device.tags.map((tag) => tag.name).join('|'),
    device.notes,
    device.createdAt,
    device.updatedAt,
  ]);

  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
