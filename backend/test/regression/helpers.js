'use strict';

/**
 * 回归测试辅助：连接的是真实 MySQL/MariaDB，后端是 spawn 出来的真实 dist/main.js 进程。
 * 不使用任何内存替身，所有读写都落真实库；每个套件使用独立 database 以便隔离、可重复运行。
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const mysql = require('mysql2/promise');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const INIT_SQL = path.join(REPO_ROOT, 'database', 'init.sql');
const LEGACY_SQL = path.join(__dirname, 'fixtures', 'legacy-v1.sql');

const DB_HOST = process.env.MYSQL_TEST_HOST || '127.0.0.1';
const DB_PORT = Number(process.env.MYSQL_TEST_PORT || 3399);
const DB_ADMIN_USER = process.env.MYSQL_TEST_USER || 'ct';
const DB_ADMIN_PASS = process.env.MYSQL_TEST_PASS || 'ctpw';

const net = require('node:net');

let portCursor = 34080;
const nextPort = () => (portCursor += 1);

// 让内核分配一个当前空闲端口，供子进程监听（多个测试文件/并发场景避免撞端口）。
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function adminConnection(database) {
  return mysql.createConnection({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_ADMIN_USER,
    password: DB_ADMIN_PASS,
    database,
    multipleStatements: true,
    dateStrings: true
  });
}

/** 删除并重建一个干净的库（真实 DROP/CREATE，可重复运行）。 */
async function recreateDatabase(name) {
  const conn = await adminConnection();
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}

async function execSqlFile(conn, file) {
  const sql = fs.readFileSync(file, 'utf8');
  await conn.query(sql);
}

/** 空库初始化：建好库后导入 docker-entrypoint 用的 init.sql（基础 v1 结构 + 种子）。 */
async function provisionFresh(name) {
  await recreateDatabase(name);
  const conn = await adminConnection(name);
  try {
    await execSqlFile(conn, INIT_SQL);
  } finally {
    await conn.end();
  }
}

/** 旧库：导入“上线前”的 v1 结构 + 存量数据（没有版本列）。 */
async function provisionLegacy(name) {
  await recreateDatabase(name);
  const conn = await adminConnection(name);
  try {
    await execSqlFile(conn, LEGACY_SQL);
  } finally {
    await conn.end();
  }
}

async function openPool(name) {
  return mysql.createPool({
    host: DB_HOST,
    port: DB_PORT,
    user: DB_ADMIN_USER,
    password: DB_ADMIN_PASS,
    database: name,
    waitForConnections: true,
    connectionLimit: 5,
    dateStrings: true
  });
}

async function columnExists(pool, table, column) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].c) > 0;
}

async function indexExists(pool, table, index) {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return Number(rows[0].c) > 0;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildServerEnv(database, port, jwtSecret, logLevel) {
  return {
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: logLevel || process.env.LOG_LEVEL || 'error',
    PORT: String(port),
    MYSQL_HOST: DB_HOST,
    MYSQL_PORT: String(DB_PORT),
    DB_NAME: database,
    DB_USER: DB_ADMIN_USER,
    DB_PASSWORD: DB_ADMIN_PASS,
    JWT_SECRET: jwtSecret,
    TYPEORM_SYNC: 'false'
  };
}

/** 仅启动子进程并返回句柄，不等待健康（用于测试“基础表尚未就绪时等待”/多实例并发）。 */
async function spawnServer({ database, port, jwtSecret = 'regtest-secret', logLevel } = {}) {
  const listenPort = port || (await getFreePort());
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'backend', 'dist', 'main.js')], {
    cwd: path.join(REPO_ROOT, 'backend'),
    env: buildServerEnv(database, listenPort, jwtSecret, logLevel),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let out = '';
  // 不持有事件循环：若某用例遗漏停止，runner 仍可退出（句柄在 after() 中统一回收）。
  child.unref();
  child.stdout.on('data', (d) => { out += d.toString(); });
  child.stderr.on('data', (d) => { out += d.toString(); });
  const base = `http://127.0.0.1:${listenPort}`;
  return { child, port: listenPort, base, out: () => out, stop: () => stopServer(child) };
}

async function waitForHealthy(handle, { timeoutMs = 40000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    if (handle.child.killed || handle.child.exitCode !== null) {
      throw new Error(`server exited early (code=${handle.child.exitCode}):\n${handle.out()}`);
    }
    try {
      const res = await fetch(`${handle.base}/health`);
      if (res.ok) return handle;
    } catch (e) { lastErr = e; }
    await sleep(500);
  }
  throw new Error(`not healthy within ${timeoutMs}ms: ${lastErr?.message}\n${handle.out()}`);
}

/** 向已存在的库导入 init.sql（模拟 docker entrypoint 在后端启动期间完成初始化）。 */
async function loadInitIntoExisting(name) {
  const sql = fs.readFileSync(INIT_SQL, 'utf8');
  await mutateRaw(name, (conn) => conn.query(sql));
}

/**
 * 启动真实后端子进程（dist/main.js）。
 * 默认等待迁移完成且 /health 就绪；expectFailure=true 时等待进程以非零码退出（迁移阻断启动）。
 */
async function startServer({
  database,
  port,
  expectFailure = false,
  jwtSecret = 'regtest-secret',
  logLevel,
  startupTimeoutMs = 90000
} = {}) {
  const handle = await spawnServer({ database, port, jwtSecret, logLevel });

  const exited = new Promise((resolve) => handle.child.on('exit', (code) => resolve(code)));

  if (expectFailure) {
    const raceResult = await Promise.race([
      exited.then((exitCode) => ({ code: exitCode, timedOut: false })),
      sleep(startupTimeoutMs).then(() => ({ code: null, timedOut: true }))
    ]);
    return { ...handle, exitResult: raceResult };
  }

  const deadline = Date.now() + startupTimeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    if (handle.child.killed || handle.child.exitCode !== null) {
      throw new Error(`server exited early (code=${handle.child.exitCode}) before health:\n${handle.out()}`);
    }
    try {
      const res = await fetch(`${handle.base}/health`);
      if (res.ok) return handle;
    } catch (e) {
      lastErr = e;
    }
    await sleep(500);
  }
  await stopServer(handle.child);
  throw new Error(`server did not become healthy in ${startupTimeoutMs}ms: ${lastErr?.message}\n${handle.out()}`);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    const t = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch {}
      resolve();
    }, 5000);
    child.on('exit', () => { clearTimeout(t); resolve(); });
  });
}

/**
 * 在同一数据源上“并发”启动 n 个真实实例（模拟多副本同时发布）。
 * - expectFailure=true：等待每个实例都以非零码退出（迁移失败，全体拒绝服务）。
 * - 否则等待全部实例健康；leader/waiter 角色从迁移日志中判定。
 */
async function startCluster({
  database,
  count = 2,
  expectFailure = false,
  logLevel = 'info',
  startupTimeoutMs = 90000
} = {}) {
  const handles = await Promise.all(
    Array.from({ length: count }, () => spawnServer({ database, logLevel }))
  );

  if (expectFailure) {
    const exitCodes = await Promise.all(
      handles.map((h) =>
        Promise.race([
          new Promise((resolve) => h.child.on('exit', (c) => resolve(c))),
          sleep(startupTimeoutMs).then(() => '__timeout__')
        ])
      )
    );
    return { handles, exitCodes };
  }

  await Promise.all(handles.map((h) => waitForHealthy(h, { timeoutMs: startupTimeoutMs })));

  // 给迁移日志一点时间刷盘，再判定 leader/waiter。
  await sleep(300);
  const roles = handles.map((h) => {
    const log = h.out();
    if (log.includes('role=leader')) return 'leader';
    if (log.includes('role=waiter')) return 'waiter';
    return log.includes('already applied, skipping') ? 'skip' : 'unknown';
  });
  return { handles, roles };
}

/** 直接对真实数据库做变更（模拟运维修复重复数据）。 */
async function mutateRaw(name, fn) {
  const conn = await adminConnection(name);
  try {
    return await fn(conn);
  } finally {
    await conn.end();
  }
}

function api(base, token) {
  async function call(method, urlPath, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${base}${urlPath}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
    return { status: res.status, body: json, headers: res.headers };
  }
  return {
    get: (p) => call('GET', p),
    post: (p, b) => call('POST', p, b),
    patch: (p, b) => call('PATCH', p, b),
    del: (p) => call('DELETE', p)
  };
}

async function login(base, email, password = 'password123') {
  const res = await api(base).post('/users/login', { email, password });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`login ${email} failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user };
}

module.exports = {
  DB_HOST,
  DB_PORT,
  provisionFresh,
  provisionLegacy,
  recreateDatabase,
  openPool,
  columnExists,
  indexExists,
  startServer,
  startCluster,
  spawnServer,
  waitForHealthy,
  loadInitIntoExisting,
  getFreePort,
  stopServer,
  mutateRaw,
  api,
  login,
  sleep
};
