// D1-compatible SQLite adapter for self-hosted deployment.
// Implements the subset of the D1Database API used by this app on top of
// node:sqlite (built into Node 22+). Route code keeps calling c.env.DB
// without any changes.
import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { readFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

interface Meta {
  rows_read: number;
  rows_written: number;
  last_row_id?: number;
  changes?: number;
  duration: number;
}

interface Res<T = unknown> {
  success: boolean;
  results?: T[];
  meta: Meta;
}

// Implements the same shape as D1PreparedStatement (from @cloudflare/workers-types)
// so routes compiled for D1 typecheck unchanged against this adapter.
class Stmt {
  private db: DatabaseSync;
  private sql: string;
  private bound: unknown[] = [];

  constructor(db: DatabaseSync, sql: string) {
    this.db = db;
    this.sql = sql;
  }

  bind(...values: unknown[]): this {
    // node:sqlite rejects undefined params; coerce to null (SQL NULL).
    this.bound = values.map((v) => (v === undefined ? null : v));
    return this;
  }

  async all<T = unknown>(): Promise<Res<T>> {
    const stmt: StatementSync = this.db.prepare(this.sql);
    const rows = stmt.all(...(this.bound as Parameters<StatementSync['all']>)) as T[];
    return {
      success: true,
      results: rows,
      meta: { rows_read: rows.length, rows_written: 0, duration: 0 },
    };
  }

  async first<T = unknown>(): Promise<T | null> {
    const stmt: StatementSync = this.db.prepare(this.sql);
    const row = stmt.get(...(this.bound as Parameters<StatementSync['get']>)) as T | undefined;
    return row ?? null;
  }

  async run(): Promise<Res> {
    const stmt: StatementSync = this.db.prepare(this.sql);
    const info = stmt.run(...(this.bound as Parameters<StatementSync['run']>)) as { changes: number; lastInsertRowid: number | bigint };
    const lastRowId =
      typeof info.lastInsertRowid === 'bigint'
        ? Number(info.lastInsertRowid)
        : info.lastInsertRowid;
    return {
      success: true,
      meta: {
        rows_read: 0,
        rows_written: info.changes,
        last_row_id: lastRowId,
        changes: info.changes,
        duration: 0,
      },
    };
  }

  async raw<T = unknown>(): Promise<T[]> {
    const stmt: StatementSync = this.db.prepare(this.sql);
    return stmt.all(...(this.bound as Parameters<StatementSync['all']>)) as T[];
  }
}

export class ServerDatabase {
  private db: DatabaseSync;

  constructor(path: string) {
    if (path !== ':memory:') {
      const dir = dirname(path);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    }
    this.db = new DatabaseSync(path);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  prepare(sql: string): Stmt {
    return new Stmt(this.db, sql);
  }

  // D1 batch: execute statements in a transaction, return one result per statement.
  async batch<T = unknown>(statements: Stmt[]): Promise<Res<T>[]> {
    this.db.exec('BEGIN');
    try {
      const out: Res<T>[] = [];
      for (const s of statements) {
        out.push(await s.all<T>());
      }
      this.db.exec('COMMIT');
      return out;
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }

  async exec(sql: string): Promise<Res> {
    this.db.exec(sql);
    return { success: true, meta: { rows_read: 0, rows_written: 0, duration: 0 } };
  }

  close(): void {
    this.db.close();
  }

  // Run migrations from the migrations/ directory (files applied in order).
  runMigrations(migrationsDir: string): void {
    const files = readdirSync(migrationsDir).sort();
    this.db.exec('BEGIN');
    try {
      for (const f of files) {
        if (!f.endsWith('.sql')) continue;
        const sql = readFileSync(`${migrationsDir}/${f}`, 'utf-8');
        this.db.exec(sql);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}

export function createDb(dbPath: string): ServerDatabase {
  return new ServerDatabase(dbPath);
}

