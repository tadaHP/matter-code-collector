import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('admin'),
    createdAt: integer('created_at').notNull(),
    lastLoginAt: integer('last_login_at'),
  },
  (table) => ({
    usernameIdx: uniqueIndex('users_username_idx').on(table.username),
  }),
);

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: integer('created_at').notNull(),
    expiresAt: integer('expires_at').notNull(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex('sessions_token_hash_idx').on(table.tokenHash),
  }),
);

export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    alias: text('alias').notNull(),
    deviceName: text('device_name').notNull().default(''),
    qrPayload: text('qr_payload').notNull(),
    numericCode: text('numeric_code').notNull(),
    manufacturer: text('manufacturer').notNull().default(''),
    model: text('model').notNull().default(''),
    location: text('location').notNull().default(''),
    notes: text('notes').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    qrPayloadIdx: uniqueIndex('devices_qr_payload_idx').on(table.qrPayload),
    numericCodeIdx: uniqueIndex('devices_numeric_code_idx').on(table.numericCode),
  }),
);

export const tags = sqliteTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('tags_name_idx').on(table.name),
  }),
);

export const locations = sqliteTable(
  'locations',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    nameIdx: uniqueIndex('locations_name_idx').on(table.name),
  }),
);

export const deviceTags = sqliteTable(
  'device_tags',
  {
    deviceId: text('device_id')
      .notNull()
      .references(() => devices.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.deviceId, table.tagId] }),
  }),
);

export type DeviceRow = typeof devices.$inferSelect;
export type TagRow = typeof tags.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;
export type UserRow = typeof users.$inferSelect;
