import { Kysely, PostgresDialect, sql } from 'kysely';
import { Pool, types } from 'pg';
import type { DB } from '@/types/db';

// Keep `date` columns (OID 1082) as plain "YYYY-MM-DD" strings. pg's default
// turns them into a Date at UTC midnight, which serialises as a full ISO
// timestamp and breaks every date comparison and Map key in the app.
types.setTypeParser(1082, (val: string) => val);

declare global {
  var __erpDb: Kysely<DB> | undefined;
}

function createDb(): Kysely<DB> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
  });
  // An idle client dying (DB restart, network blip) emits 'error'; unhandled,
  // it would crash the whole server. pg already dropped the client — just log.
  pool.on('error', (err) => console.error('[pg] idle client error:', err.message));
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

// Created on first use, not at import, so `next build` works without a DB.
function getDb(): Kysely<DB> {
  return (globalThis.__erpDb ??= createDb());
}

export const db = new Proxy({} as Kysely<DB>, {
  get(_t, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === 'function' ? value.bind(real) : value;
  },
});

export { sql };
