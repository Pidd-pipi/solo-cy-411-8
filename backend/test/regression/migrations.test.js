'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  provisionFresh,
  provisionLegacy,
  recreateDatabase,
  openPool,
  columnExists,
  indexExists,
  startServer,
  spawnServer,
  waitForHealthy,
  loadInitIntoExisting,
  stopServer,
  mutateRaw,
  api,
  login,
  sleep
} = require('./helpers');

const FACTOR_COLS = ['version', 'effective_date', 'status', 'created_at'];
const ACTIVITY_COLS = ['factor_version', 'factor_value_snapshot', 'factor_effective_date'];
const FACTOR_INDEXES = ['uk_factor_version', 'uk_factor_version_no', 'idx_factor_match'];

async function assertVersionedSchema(pool) {
  for (const c of FACTOR_COLS) assert.ok(await columnExists(pool, 'carbon_factors', c), `carbon_factors.${c} 存在`);
  for (const c of ACTIVITY_COLS) assert.ok(await columnExists(pool, 'activities', c), `activities.${c} 存在`);
  for (const i of FACTOR_INDEXES) assert.ok(await indexExists(pool, 'carbon_factors', i), `索引 ${i} 存在`);
}

async function countIndexes(pool) {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='carbon_factors' GROUP BY INDEX_NAME`
  );
  return rows.length;
}

const handles = [];
after(async () => {
  for (const h of handles) {
    try { await stopServer(h.child); } catch {}
  }
});

// ---- 空库初始化：真实复现“新数据卷 + 新版后端” -----------------------------
test('空库初始化：init.sql 后启动即完成 002，重复启动不重建结构、不丢数据', async () => {
  const db = 'ct_fresh';
  await provisionFresh(db);

  const srv = await startServer({ database: db });
  handles.push(srv);
  assert.equal((await (await fetch(`${srv.base}/health`)).json()).status, 'ok');

  const pool = await openPool(db);
  await assertVersionedSchema(pool);

  const [[factorTotal]] = await pool.query('SELECT COUNT(*) c FROM carbon_factors');
  const [[v1]] = await pool.query(
    `SELECT COUNT(*) c FROM carbon_factors WHERE version=1 AND effective_date='2000-01-01' AND status='active'`
  );
  assert.equal(Number(v1.c), Number(factorTotal.c), '所有种子因子回填为 v1/2000/active');

  const [[actTotal]] = await pool.query('SELECT COUNT(*) c FROM activities');
  const [[pinned]] = await pool.query(
    `SELECT COUNT(*) c FROM activities
     WHERE factor_version=1 AND factor_value_snapshot IS NOT NULL AND factor_effective_date='2000-01-01'`
  );
  assert.equal(Number(pinned.c), Number(actTotal.c), '所有引用因子的活动均固化');

  const [[migrated]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(migrated.c), 1);

  // 真实接口：无 token 401；管理员登录后读到全部因子
  assert.equal((await api(srv.base).get('/factors')).status, 401);
  const admin = await login(srv.base, 'demo@carbontrack.local');
  const listRes = await api(srv.base, admin.token).get('/factors');
  assert.equal(listRes.status, 200);
  assert.equal(listRes.body.length, Number(factorTotal.c));

  // 第二次启动（同一持久库、全新进程）：结构不重复、登记只一条、数据不丢
  const before = await countIndexes(pool);
  await stopServer(srv.child);
  const srv2 = await startServer({ database: db });
  handles.push(srv2);
  assert.equal(await countIndexes(pool), before, '重复启动不重复建索引');
  const [[again]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(again.c), 1);
  const [[factorsAfter]] = await pool.query('SELECT COUNT(*) c FROM carbon_factors');
  assert.equal(Number(factorsAfter.c), Number(factorTotal.c), '因子数量不变');
  await pool.end();
});

// ---- 全新库但 init.sql 尚未就绪：等待初始化，期间建好后续跑成功 --------------
test('基础表缺失时服务等待；init.sql 在重试窗口内就绪后迁移成功并对外服务', async () => {
  const db = 'ct_empty_then_init';
  await recreateDatabase(db);

  const srv = await spawnServer({ database: db });
  handles.push(srv);
  await sleep(1500); // 让迁移先观察到“基础表不存在”，进入等待
  // 此刻不应已健康
  let earlyUp = true;
  try {
    const r = await fetch(`${srv.base}/health`);
    earlyUp = r.ok;
  } catch { earlyUp = false; }
  assert.equal(earlyUp, false, '基础表缺失期间不对外服务');

  // 模拟 docker entrypoint 在后端等待期间完成基础结构导入
  await loadInitIntoExisting(db);

  await waitForHealthy(srv, { timeoutMs: 40000 });
  const pool = await openPool(db);
  await assertVersionedSchema(pool);
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 1, '等待后迁移成功并登记');
  await pool.end();
});

// ---- 旧库升级：保留命名卷直接换新版后端 --------------------------------------
test('旧库升级：补齐结构与快照，因子/活动/目标/权限不变且重复升级幂等', async () => {
  const db = 'ct_legacy';
  await provisionLegacy(db);
  const srv = await startServer({ database: db });
  handles.push(srv);
  const pool = await openPool(db);

  await assertVersionedSchema(pool);

  const [[fc]] = await pool.query(
    `SELECT COUNT(*) c FROM carbon_factors WHERE version=1 AND effective_date='2000-01-01' AND status='active'`
  );
  assert.equal(Number(fc.c), 3, '三个旧因子回填为 v1');

  const [[a1]] = await pool.query(
    `SELECT carbon_value, factor_version, factor_value_snapshot, factor_effective_date d
     FROM activities WHERE id=1`
  );
  assert.equal(Number(a1.carbon_value).toFixed(2), '5.70', '旧 carbon_value 保留');
  assert.equal(a1.factor_version, 1);
  assert.equal(Number(a1.factor_value_snapshot).toFixed(4), '0.5700');
  assert.equal(String(a1.d).slice(0, 10), '2000-01-01');

  const [[goals]] = await pool.query('SELECT COUNT(*) c FROM goals');
  const [[audits]] = await pool.query('SELECT COUNT(*) c FROM audit_logs');
  const [[users]] = await pool.query('SELECT COUNT(*) c FROM users');
  assert.equal(Number(goals.c), 1);
  assert.equal(Number(audits.c), 1);
  assert.equal(Number(users.c), 2, '用户/目标/审计数量不变');

  // 真实权限保留：管理员可登录、成员仍存在
  const admin = await login(srv.base, 'demo@carbontrack.local');
  assert.ok(admin.user.roles.includes('admin'));
  await login(srv.base, 'river@carbontrack.local');

  // 排行榜仍能读出旧活动固化结果
  const rank = await api(srv.base, admin.token).get('/ranking');
  assert.equal(rank.status, 200);
  const demo = rank.body.find((r) => r.username === 'demo');
  assert.ok(demo && demo.totalCarbon > 0, '排行榜汇总旧活动 carbon_value');

  // 再次启动幂等，快照不覆盖
  await stopServer(srv.child);
  const srv2 = await startServer({ database: db });
  handles.push(srv2);
  const [[a1b]] = await pool.query('SELECT carbon_value, factor_version FROM activities WHERE id=1');
  assert.equal(Number(a1b.carbon_value).toFixed(2), '5.70');
  assert.equal(a1b.factor_version, 1);
  const [[migCount]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(migCount.c), 1);
  await pool.end();
});

// ---- 迁移遇到重复数据：阻断启动、保留原数据、修复后续跑 ------------------------
test('存量重复时拒绝启动且保数据；修复重复后重启升级成功', async () => {
  const db = 'ct_legacy_dup';
  await provisionLegacy(db);
  // 同一身份的第二条旧因子（补默认 version 后会撞唯一约束）
  await mutateRaw(db, (conn) =>
    conn.query(
      `INSERT INTO carbon_factors (id, category, sub_type, factor_value, unit, region)
       VALUES (99, 'energy','electricity', 0.9900, 'kWh','Shanghai')`
    )
  );

  const failed = await startServer({ database: db, expectFailure: true, startupTimeoutMs: 60000 });
  handles.push(failed);
  assert.equal(failed.exitResult.timedOut, false, '冲突时进程退出而非挂起');
  assert.notEqual(failed.exitResult.code, 0, '退出码非零');
  await assert.rejects(() => fetch(`http://127.0.0.1:${failed.port}/health`), '未监听端口');

  const pool = await openPool(db);
  const [[f4]] = await pool.query('SELECT COUNT(*) c FROM carbon_factors');
  const [[a3]] = await pool.query('SELECT COUNT(*) c FROM activities');
  assert.equal(Number(f4.c), 4, '冲突因子保留（未删数据）');
  assert.equal(Number(a3.c), 3, '活动保留');
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 0, '002 未登记，修复后可续跑');

  // 运维修复：删除重复因子后重启
  await pool.end();
  await mutateRaw(db, (conn) => conn.query('DELETE FROM carbon_factors WHERE id=99'));

  const ok = await startServer({ database: db });
  handles.push(ok);
  const pool2 = await openPool(db);
  await assertVersionedSchema(pool2);
  const [[mig2]] = await pool2.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig2.c), 1, '修复后 002 成功登记');
  assert.equal((await api(ok.base).get('/factors')).status, 401);
  await pool2.end();
});
