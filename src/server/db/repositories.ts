import { and, asc, eq, inArray, ne, or } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getDb } from './client';
import { deviceTags, devices, locations, tags, type DeviceRow, type LocationRow, type TagRow } from './schema';

export type DeviceDto = {
  id: string;
  alias: string;
  deviceName: string;
  qrPayload: string;
  numericCode: string;
  manufacturer: string;
  model: string;
  location: string;
  tags: TagDto[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type TagDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type LocationDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type DeviceInput = {
  alias: string;
  deviceName?: string;
  qrPayload: string;
  numericCode: string;
  manufacturer?: string;
  model?: string;
  location?: string;
  notes?: string;
  tagIds?: string[];
};

export type DeviceQuery = {
  q?: string;
  location?: string;
  tagId?: string;
  sort?: string;
};

export function listDevices(query: DeviceQuery = {}) {
  const db = getDb();
  const rows = db.select().from(devices).all();
  const tagMap = getTagsByDeviceIds(rows.map((row) => row.id));
  const normalizedQuery = query.q?.trim().toLowerCase() ?? '';

  return rows
    .map((row) => toDeviceDto(row, tagMap.get(row.id) ?? []))
    .filter((device) => {
      const text = [
        device.alias,
        device.deviceName,
        device.qrPayload,
        device.numericCode,
        device.manufacturer,
        device.model,
        device.location,
        device.notes,
        device.tags.map((tag) => tag.name).join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return (
        (!normalizedQuery || text.includes(normalizedQuery)) &&
        (!query.location || device.location === query.location) &&
        (!query.tagId || device.tags.some((tag) => tag.id === query.tagId))
      );
    })
    .sort((a, b) => {
      if (query.sort === 'name') return a.alias.localeCompare(b.alias, 'ko');
      if (query.sort === 'created') return b.createdAt.localeCompare(a.createdAt);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
}

export function getDevice(id: string) {
  const row = getDb().select().from(devices).where(eq(devices.id, id)).get();
  if (!row) return null;

  return toDeviceDto(row, getTagsByDeviceIds([id]).get(id) ?? []);
}

export function createDevice(input: DeviceInput) {
  assertNoDuplicateDevice(input);

  const db = getDb();
  const now = Date.now();
  const id = randomUUID();

  db.insert(devices)
    .values({
      id,
      alias: input.alias,
      deviceName: input.deviceName ?? '',
      qrPayload: input.qrPayload,
      numericCode: input.numericCode,
      manufacturer: input.manufacturer ?? '',
      model: input.model ?? '',
      location: input.location ?? '',
      notes: input.notes ?? '',
      createdAt: now,
      updatedAt: now,
    })
    .run();
  replaceDeviceTags(id, input.tagIds ?? []);

  return getDevice(id);
}

export function updateDevice(id: string, input: DeviceInput) {
  const existing = getDb().select().from(devices).where(eq(devices.id, id)).get();
  if (!existing) return null;

  assertNoDuplicateDevice(input, id);

  const db = getDb();

  db.update(devices)
    .set({
      alias: input.alias,
      deviceName: input.deviceName ?? '',
      qrPayload: input.qrPayload,
      numericCode: input.numericCode,
      manufacturer: input.manufacturer ?? '',
      model: input.model ?? '',
      location: input.location ?? '',
      notes: input.notes ?? '',
      updatedAt: Date.now(),
    })
    .where(eq(devices.id, id))
    .run();
  replaceDeviceTags(id, input.tagIds ?? []);

  return getDevice(id);
}

export function deleteDevice(id: string) {
  const result = getDb().delete(devices).where(eq(devices.id, id)).run();
  return result.changes > 0;
}

export function listTags() {
  return getDb().select().from(tags).orderBy(asc(tags.name)).all().map(toTagDto);
}

export function createTag(name: string) {
  assertNoDuplicateTag(name);

  const now = Date.now();
  const row = {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  getDb().insert(tags).values(row).run();
  return toTagDto(row);
}

export function updateTag(id: string, name: string) {
  const existing = getDb().select().from(tags).where(eq(tags.id, id)).get();
  if (!existing) return null;

  assertNoDuplicateTag(name, id);

  getDb().update(tags).set({ name, updatedAt: Date.now() }).where(eq(tags.id, id)).run();
  const updated = getDb().select().from(tags).where(eq(tags.id, id)).get();
  return updated ? toTagDto(updated) : null;
}

export function deleteTag(id: string) {
  const result = getDb().delete(tags).where(eq(tags.id, id)).run();
  return result.changes > 0;
}

export function listLocations() {
  return getDb().select().from(locations).orderBy(asc(locations.name)).all().map(toLocationDto);
}

export function createLocation(name: string) {
  assertNoDuplicateLocation(name);

  const now = Date.now();
  const row = {
    id: randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
  };

  getDb().insert(locations).values(row).run();
  return toLocationDto(row);
}

export function updateLocation(id: string, name: string) {
  const existing = getDb().select().from(locations).where(eq(locations.id, id)).get();
  if (!existing) return null;

  assertNoDuplicateLocation(name, id);

  const db = getDb();

  db.update(locations).set({ name, updatedAt: Date.now() }).where(eq(locations.id, id)).run();
  db.update(devices)
    .set({ location: name, updatedAt: Date.now() })
    .where(eq(devices.location, existing.name))
    .run();

  const updated = db.select().from(locations).where(eq(locations.id, id)).get();
  return updated ? toLocationDto(updated) : null;
}

export function deleteLocation(id: string) {
  const existing = getDb().select().from(locations).where(eq(locations.id, id)).get();
  if (!existing) return false;

  const db = getDb();

  db.delete(locations).where(eq(locations.id, id)).run();
  db.update(devices)
    .set({ location: '', updatedAt: Date.now() })
    .where(eq(devices.location, existing.name))
    .run();

  return true;
}

function assertNoDuplicateDevice(input: DeviceInput, excludeId?: string) {
  const duplicateCondition = or(eq(devices.qrPayload, input.qrPayload), eq(devices.numericCode, input.numericCode));
  const whereCondition = excludeId ? and(duplicateCondition, ne(devices.id, excludeId)) : duplicateCondition;
  const duplicate = getDb()
    .select({ id: devices.id })
    .from(devices)
    .where(whereCondition)
    .get();

  if (duplicate) {
    throw new ConflictError('이미 같은 QR 인식값 또는 숫자 코드가 등록되어 있습니다.');
  }
}

function assertNoDuplicateTag(name: string, excludeId?: string) {
  const whereCondition = excludeId ? and(eq(tags.name, name), ne(tags.id, excludeId)) : eq(tags.name, name);
  const duplicate = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(whereCondition)
    .get();

  if (duplicate) {
    throw new ConflictError('이미 등록된 태그 이름입니다.');
  }
}

function assertNoDuplicateLocation(name: string, excludeId?: string) {
  const whereCondition = excludeId ? and(eq(locations.name, name), ne(locations.id, excludeId)) : eq(locations.name, name);
  const duplicate = getDb()
    .select({ id: locations.id })
    .from(locations)
    .where(whereCondition)
    .get();

  if (duplicate) {
    throw new ConflictError('이미 등록된 위치 이름입니다.');
  }
}

function replaceDeviceTags(deviceId: string, tagIds: string[]) {
  const db = getDb();
  const uniqueTagIds = Array.from(new Set(tagIds));

  db.delete(deviceTags).where(eq(deviceTags.deviceId, deviceId)).run();

  if (uniqueTagIds.length === 0) return;

  const existingTags = db.select({ id: tags.id }).from(tags).where(inArray(tags.id, uniqueTagIds)).all();
  const existingIds = new Set(existingTags.map((tag) => tag.id));
  const invalidIds = uniqueTagIds.filter((id) => !existingIds.has(id));

  if (invalidIds.length > 0) {
    throw new ValidationError('존재하지 않는 태그가 포함되어 있습니다.');
  }

  db.insert(deviceTags)
    .values(uniqueTagIds.map((tagId) => ({ deviceId, tagId })))
    .run();
}

function getTagsByDeviceIds(deviceIds: string[]) {
  const result = new Map<string, TagDto[]>();

  if (deviceIds.length === 0) return result;

  const rows = getDb()
    .select({
      deviceId: deviceTags.deviceId,
      id: tags.id,
      name: tags.name,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    })
    .from(deviceTags)
    .innerJoin(tags, eq(deviceTags.tagId, tags.id))
    .where(inArray(deviceTags.deviceId, deviceIds))
    .orderBy(asc(tags.name))
    .all();

  for (const row of rows) {
    const items = result.get(row.deviceId) ?? [];
    items.push(toTagDto(row));
    result.set(row.deviceId, items);
  }

  return result;
}

function toDeviceDto(row: DeviceRow, tagDtos: TagDto[]): DeviceDto {
  return {
    id: row.id,
    alias: row.alias,
    deviceName: row.deviceName,
    qrPayload: row.qrPayload,
    numericCode: row.numericCode,
    manufacturer: row.manufacturer,
    model: row.model,
    location: row.location,
    tags: tagDtos,
    notes: row.notes,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

function toTagDto(row: TagRow): TagDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

function toLocationDto(row: LocationRow): LocationDto {
  return {
    id: row.id,
    name: row.name,
    createdAt: formatDate(row.createdAt),
    updatedAt: formatDate(row.updatedAt),
  };
}

function formatDate(value: number) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

export class ConflictError extends Error {
  status = 409;
}

export class ValidationError extends Error {
  status = 400;
}
