// Self-hosted server entry point (Node.js + SQLite).
// Replaces the Cloudflare Worker wrapper (index.ts default export) with a
// plain Node HTTP server: serves the static frontend from ./public and the
// same /api routes, plus an in-process cron loop replacing the Worker
// scheduled trigger.
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { createDb } from './server-db';
import type { Env } from './types';
import { runTokenRefresh, runEmailPush } from './cron';

const PORT = parseInt(process.env.PORT || '8787', 10);
const DB_PATH = process.env.DB_PATH || '/data/outlook-email.db';
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR || './migrations';
const PUBLIC_DIR = process.env.PUBLIC_DIR || './public';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const COOKIE_SECRET = process.env.COOKIE_SECRET || '';
const GPTMAIL_API_KEY = process.env.GPTMAIL_API_KEY || '';

if (!ADMIN_PASSWORD || !COOKIE_SECRET) {
  console.error('FATAL: ADMIN_PASSWORD and COOKIE_SECRET env vars are required');
  process.exit(1);
}

// --- Database (SQLite, D1-compatible) ---
const db = createDb(DB_PATH);
db.runMigrations(MIGRATIONS_DIR);
console.log(`[db] ready at ${DB_PATH}`);

const env: Env = {
  DB: db,
  ADMIN_PASSWORD,
  COOKIE_SECRET,
  GPTMAIL_API_KEY: GPTMAIL_API_KEY || undefined,
};

// --- App: static + API ---
const app = new Hono<{ Bindings: Env }>();

// Serve static files first (login page, app assets). Anything under /api is
// routed by the API handlers below and never hits this.
app.use('*', serveStatic({ root: PUBLIC_DIR }));

// API routes (copied wiring from index.ts; the DB/secret plumbing is the env above)
import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import accountRoutes from './routes/accounts';
import emailRoutes from './routes/emails';
import settingRoutes from './routes/settings';
import tempEmailRoutes from './routes/tempEmails';
import oauthRoutes from './routes/oauth';
import externalRoutes from './routes/external';
import tagRoutes from './routes/tags';
import { authMiddleware } from './auth';
import { fail } from './response';

const api = new Hono<{ Bindings: Env }>();
api.route('/auth', authRoutes);
api.route('/oauth', oauthRoutes);
api.route('/external', externalRoutes);
api.use('*', authMiddleware());
api.route('/groups', groupRoutes);
api.route('/tags', tagRoutes);
api.route('/accounts', accountRoutes);
api.route('/accounts/:id/emails', emailRoutes);
api.route('/settings', settingRoutes);
api.route('/temp-emails', tempEmailRoutes);

api.onError((err, c) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('Unhandled error:', msg);
  if (/no such table|no such column/i.test(msg)) {
    return fail('DB_NOT_READY', '数据库未就绪：请检查 SQLite 迁移是否已运行', 500);
  }
  if (/D1_|SQLITE_|not authorized/i.test(msg)) {
    return fail('DB_ERROR', `数据库操作失败：${msg}`, 500);
  }
  if (/key|HMAC|crypto|importKey/i.test(msg)) {
    return fail('CONFIG_MISSING', '服务端密钥未配置：请设置 COOKIE_SECRET 和 ADMIN_PASSWORD', 500);
  }
  return fail('INTERNAL_ERROR', '服务器内部错误，请检查部署配置', 500);
});

// Mount API under /api
app.route('/api', api);

// Fallback for unknown non-API paths: serve index.html (SPA-ish single page)
app.get('*', (c) => {
  if (c.req.path.startsWith('/api/')) {
    return fail('NOT_FOUND', '接口不存在', 404);
  }
  // Return index.html content (simpler and type-safe than re-invoking middleware)
  const file = readFileSync(join(PUBLIC_DIR, 'index.html'));
  return c.html(file.toString());
});

// --- Cron loop (replaces Worker scheduled trigger) ---
const CRON_INTERVAL_MS = parseInt(process.env.CRON_INTERVAL_MS || String(6 * 60 * 60 * 1000), 10); // 6h default
async function tick() {
  try {
    const [refreshResult, pushResult] = await Promise.allSettled([
      runTokenRefresh(env),
      runEmailPush(env),
    ]);
    if (refreshResult.status === 'fulfilled') console.log(`[cron] token refresh: ${refreshResult.value}`);
    else console.error('[cron] token refresh failed:', refreshResult.reason);
    if (pushResult.status === 'fulfilled') console.log(`[cron] email push: ${pushResult.value}`);
    else console.error('[cron] email push failed:', pushResult.reason);
  } catch (e) {
    console.error('[cron] tick error:', e);
  }
}
setInterval(tick, CRON_INTERVAL_MS);
// Run once shortly after boot
setTimeout(tick, 30_000);

// --- Start ---
serve({ fetch: (req) => app.fetch(req, env), port: PORT }, (info) => {
  console.log(`[server] listening on http://${info.address}:${info.port}`);
});
