// D1 database helper functions
import type { ServerDatabase } from './server-db';

// Union type accepted by all helpers: Cloudflare D1 or self-hosted SQLite.
export type AnyDB = D1Database | ServerDatabase;
// Result shape used by run()/batchRun(): structurally compatible with D1Result.
export type AnyResult<T = Record<string, unknown>> = {
  success: boolean;
  results: T[];
  meta: {
    rows_read: number;
    rows_written: number;
    last_row_id?: number;
    changes?: number;
    duration: number;
  };
};

// D1 hard limit: a single statement may bind at most 100 parameters.
// Any dynamic IN (...) list must be chunked to stay under this.
export const D1_MAX_BOUND_PARAMS = 100;

// Split an array into chunks of at most `size` elements
export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

// Execute multiple statements in one atomic D1 batch (single round trip;
// D1 rolls the whole batch back if any statement fails)
export async function batchRun<T = Record<string, unknown>>(
  db: AnyDB,
  statements: { sql: string; params?: unknown[] }[]
): Promise<AnyResult<T>[]> {
  if (statements.length === 0) return [];
  const stmts = statements.map((s) => db.prepare(s.sql).bind(...(s.params ?? [])));
  const results = await (db.batch as (s: unknown[]) => Promise<AnyResult<T>[]>)(stmts);
  return results;
}

// Execute a query and return all rows
export async function query<T = Record<string, unknown>>(
  db: AnyDB,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.all<T>();
  return result.results ?? [];
}

// Execute a query and return the first row
export async function first<T = Record<string, unknown>>(
  db: AnyDB,
  sql: string,
  params: unknown[] = []
): Promise<T | null> {
  const stmt = db.prepare(sql).bind(...params);
  return stmt.first<T>();
}

// Execute a statement (INSERT/UPDATE/DELETE) and return metadata
export async function run(
  db: AnyDB,
  sql: string,
  params: unknown[] = []
): Promise<AnyResult> {
  const stmt = db.prepare(sql).bind(...params);
  const result = await stmt.run();
  return {
    success: true,
    results: [],
    meta: {
      rows_read: 0,
      rows_written: result.meta.rows_written ?? 0,
      last_row_id: result.meta.last_row_id,
      changes: result.meta.changes ?? 0,
      duration: 0,
    },
  };
}
