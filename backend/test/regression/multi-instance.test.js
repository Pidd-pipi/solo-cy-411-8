'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  provisionFresh,
  provisionLegacy,
  openPool,
  columnExists,
  indexExists,
  startCluster,
  stopServer,
  mutateRaw,
  api,
  login
} = require('./helpers');

const FACTOR_COLS = ['version', 'effective_date', 'status', 'created_at'];
const ACTIVITY_COLS = ['factor_version', 'factor_value_snapshot', 'factor_effective_date'];

async function assertVersionedSchema(pool) {
  for (const c of FACTOR_COLS) assert.ok(await columnExists(pool, 'carbon_factors', c), `carbon_factors.${c} 存在`);
  for (const c of ACTIVITY_COLS) assert.ok(await columnExists(pool, 'activities', c), `activities.${c} 存在`);
  assert.ok(await indexExists(pool, 'carbon_factors', 'uk_factor_version'));
}

const allHandles = [];
async function stopCluster(cluster) {
  const handles = cluster?.handles || [];
  for (const h of handles) {
    try { await stopServer(h.child); } catch {}
  }
}
after(async () => {
  for (const h of allHandles) {
    try { await stopServer(h.child); } catch {}
  }
});

const didDdl = (h) => /migration ddl applied/i.test(h.out());

// ---- 旧库：两个实例同时启动，只允许一个执行结构变更，另一个等待并复用 ----------
test('旧库并发启动两实例：仅一个 leader 执行 DDL，waiter 等待复用，两实例都健康', async () => {
  const db = 'ct_multi_legacy';
  await provisionLegacy(db);

  const cluster = await startCluster({ database: db, count: 2 });
  allHandles.push(...cluster.handles);

  // 恰好一个 leader、一个 waiter
  assert.equal(cluster.roles.filter((r) => r === 'leader').length, 1, '恰有一个执行实例');
  assert.equal(cluster.roles.filter((r) => r === 'waiter').length, 1, '另一个等待复用');

  const [h1, h2] = cluster.handles;
  // 只有 leader 真正执行了 DDL；waiter 不得重复建列/建索引
  assert.equal(didDdl(h1) || didDdl(h2), true, '至少一个实例执行了 DDL');
  assert.notEqual(didDdl(h1) && didDdl(h2), true, '不能两个实例都执行 DDL（重复建列）');

  // 两实例都健康且因子接口可用（现有接口保持可用）
  for (const h of cluster.handles) {
    const health = await (await fetch(`${h.base}/health`)).json();
    assert.equal(health.status, 'ok');
    const admin = await login(h.base, 'demo@carbontrack.local');
    const list = await api(h.base, admin.token).get('/factors');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 3);
  }

  // 共享数据源上结构只升级一次、版本登记只一条、历史回填正确
  const pool = await openPool(db);
  await assertVersionedSchema(pool);
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 1, '迁移只登记一次');
  const [[v1]] = await pool.query(
    `SELECT COUNT(*) c FROM carbon_factors WHERE version=1 AND effective_date='2000-01-01' AND status='active'`
  );
  assert.equal(Number(v1.c), 3, '历史因子回填为 v1');
  const [[a1]] = await pool.query(
    `SELECT carbon_value, factor_version, factor_value_snapshot FROM activities WHERE id=1`
  );
  assert.equal(Number(a1.carbon_value).toFixed(2), '5.70', '历史活动 carbon_value 保留');
  assert.equal(a1.factor_version, 1);
  assert.equal(Number(a1.factor_value_snapshot).toFixed(4), '0.5700');
  await pool.end();

  await stopCluster(cluster);
});

// ---- 空库：两个实例同时启动也只升级一次 --------------------------------------
test('空库并发启动两实例：单实例执行 DDL，另一实例复用，两实例都健康', async () => {
  const db = 'ct_multi_fresh';
  await provisionFresh(db);

  const cluster = await startCluster({ database: db, count: 2 });
  allHandles.push(...cluster.handles);

  assert.equal(cluster.roles.filter((r) => r === 'leader').length, 1);
  assert.equal(cluster.roles.filter((r) => r === 'waiter').length, 1);
  assert.notEqual(
    cluster.handles.every((h) => didDdl(h)),
    true,
    '空库并发也不能重复执行 DDL'
  );

  for (const h of cluster.handles) {
    const health = await (await fetch(`${h.base}/health`)).json();
    assert.equal(health.status, 'ok');
  }
  const pool = await openPool(db);
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 1);
  await pool.end();

  await stopCluster(cluster);
});

// ---- 升级失败：所有实例拒绝服务且保数据；修复后所有实例都能成功 ---------------
test('存量冲突时并发两实例都明确拒绝启动且保数据；修复后并发重启全部成功', async () => {
  const db = 'ct_multi_dup';
  await provisionLegacy(db);
  await mutateRaw(db, (conn) =>
    conn.query(
      `INSERT INTO carbon_factors (id, category, sub_type, factor_value, unit, region)
       VALUES (99, 'energy','electricity', 0.9900, 'kWh','Shanghai')`
    )
  );

  const failed = await startCluster({ database: db, count: 2, expectFailure: true, startupTimeoutMs: 60000 });
  allHandles.push(...failed.handles);

  // 两个实例都以非零码退出（等待方也要得到“失败”这一明确结论），且都不挂起
  assert.equal(failed.exitCodes.length, 2);
  for (const code of failed.exitCodes) {
    assert.notEqual(code, '__timeout__', '实例不能挂起');
    assert.notEqual(code, 0, '失败迁移必须非零退出');
  }

  // 两个端口都不提供服务
  for (const h of failed.handles) {
    await assert.rejects(() => fetch(`${h.base}/health`), '失败实例不得监听端口');
  }

  // 关键回归：失败原因必须是“重复数据”这一明确结论，而不是实例互相踩出的 Duplicate column
  for (const h of failed.handles) {
    assert.match(h.out(), /duplicate factor versions|migration .* failed|startup aborted/i, `实例给出明确失败结论: ${h.out().slice(-300)}`);
    assert.doesNotMatch(h.out(), /Duplicate column name/i, '不得因并发重复建列而失败');
  }

  // 所有实例都保留原数据，且 002 未登记
  const pool = await openPool(db);
  const [[f4]] = await pool.query('SELECT COUNT(*) c FROM carbon_factors');
  const [[a3]] = await pool.query('SELECT COUNT(*) c FROM activities');
  assert.equal(Number(f4.c), 4, '重复因子保留');
  assert.equal(Number(a3.c), 3, '活动保留');
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 0);
  await pool.end();

  // 运维修复后，再次并发启动全部实例，都成功
  await mutateRaw(db, (conn) => conn.query('DELETE FROM carbon_factors WHERE id=99'));
  const ok = await startCluster({ database: db, count: 2 });
  allHandles.push(...ok.handles);
  assert.equal(ok.roles.filter((r) => r === 'leader').length, 1);
  assert.equal(ok.roles.filter((r) => r === 'waiter').length, 1);
  for (const h of ok.handles) {
    const health = await (await fetch(`${h.base}/health`)).json();
    assert.equal(health.status, 'ok', '修复后每个实例都健康');
    const admin = await login(h.base, 'demo@carbontrack.local');
    const list = await api(h.base, admin.token).get('/factors');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 3);
  }
  const pool2 = await openPool(db);
  const [[mig2]] = await pool2.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig2.c), 1, '修复后迁移登记一次');
  await pool2.end();

  await stopCluster(ok);
});
