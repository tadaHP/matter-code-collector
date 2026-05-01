import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { count } from 'drizzle-orm';
import { dirname, resolve } from 'path';
import { mkdirSync } from 'fs';
import * as schema from './schema';

type DbBundle = {
  sqlite: Database.Database;
  db: ReturnType<typeof drizzle<typeof schema>>;
};

let bundle: DbBundle | null = null;

export function getDb() {
  if (!bundle) {
    try {
      const sqlitePath = getSqlitePath();

      mkdirSync(dirname(sqlitePath), { recursive: true });

      const sqlite = new Database(sqlitePath);

      sqlite.pragma('journal_mode = WAL');
      sqlite.pragma('foreign_keys = ON');

      const db = drizzle(sqlite, { schema });

      migrate(sqlite);

      bootstrapAdmin(db);

      bundle = {
        sqlite,
        db,
      };

    } catch (error) {
      throw error;
    }
  }

  return bundle.db;
}
function getSqlitePath() {
  const configuredPath = process.env.MATTER_SQLITE_PATH;

  if (configuredPath) {
    return resolve(configuredPath);
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('MATTER_SQLITE_PATH is required in production.');
  }

  return resolve(process.cwd(), 'data/dev.sqlite');
}

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      created_at INTEGER NOT NULL,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT '',
      qr_payload TEXT NOT NULL UNIQUE,
      numeric_code TEXT NOT NULL UNIQUE,
      manufacturer TEXT NOT NULL DEFAULT '',
      model TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_tags (
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (device_id, tag_id)
    );

    CREATE INDEX IF NOT EXISTS device_tags_tag_id_idx ON device_tags(tag_id);
    CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
  `);
}

function bootstrapAdmin(db: ReturnType<typeof drizzle<typeof schema>>) {
  const userCount = db.select({ value: count() }).from(schema.users).get()?.value ?? 0;

  if (userCount > 0) return;

  const username = process.env.ADMIN_USERNAME ?? (process.env.NODE_ENV === 'production' ? '' : 'admin');
  const password = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === 'production' ? '' : 'admin');

  if (!username || !password) {
    throw new Error('ADMIN_USERNAME and ADMIN_PASSWORD are required when no users exist.');
  }

  const now = Date.now();

  db.insert(schema.users)
    .values({
      id: randomUUID(),
      username,
      passwordHash: bcrypt.hashSync(password, 12),
      role: 'admin',
      createdAt: now,
      lastLoginAt: null,
    })
    .run();
}
