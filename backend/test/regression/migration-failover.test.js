'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { migrationLockName } = require('../../dist/migrations/runner.js');
const {
  provisionLegacy,
  openPool,
  columnExists,
  adminConnection,
  startServer,
  startCluster,
  spawnServer,
  waitForHealthy,
  stopServer,
  killServerHard,
  mutateRaw,
  api,
  login,
  sleep
} = require('./helpers');

const FACTOR_COLS = ['version', 'effective_date', 'status', 'created_at'];
const ACTIVITY_COLS = ['factor_version', 'factor_value_snapshot', 'factor_effective_date'];

async function assertVersionedSchema(pool) {
  for (const c of FACTOR_COLS) assert.ok(await columnExists(pool, 'carbon_factors', c), `carbon_factors.${c} 存在`);
  for (const c of ACTIVITY_COLS) assert.ok(await columnExists(pool, 'activities', c), `activities.${c} 存在`);
}

const handles = [];
after(async () => {
  for (const h of handles) {
    try { await stopServer(h.child); } catch {}
  }
});

async function uniqueUpgrade(pool) {
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 1, '迁移登记保持唯一');
}

// ---- 故障 1：迁移锁被独立连接长期占用超过等待时限 ---------------------------
test('迁移锁被占用超过等待时限：等待实例非零退出、不对外服务、不做任何结构变更；释放后可正常升级', async (t) => {
  const db = 'ct_fault_lock';
  await provisionLegacy(db);
  const lockName = migrationLockName(db);

  // 用一条与后端完全独立的连接长期持有迁移咨询锁（模拟 leader 卡死/慢升级）。
  const holder = await adminConnection(db);
  t.after(async () => {
    // 即使前置断言失败也要释放锁/连接，避免咨询锁泄漏到下一轮（咨询锁是服务器全局的）。
    try { await holder.query('SELECT RELEASE_LOCK(?)', [lockName]); } catch {}
    await holder.end().catch(() => {});
  });
  const [got] = await holder.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
  assert.equal(Number(got[0].acquired), 1, '独立连接成功占用迁移锁');

  const failed = await startServer({
    database: db,
    expectFailure: true,
    startupTimeoutMs: 40000,
    logLevel: 'info',
    extraEnv: { MIGRATION_LOCK_TIMEOUT: '2' } // 只等 2 秒
  });
  handles.push(failed);

  assert.notEqual(failed.exitResult.code, '__timeout__', '等待实例不能挂起');
  assert.notEqual(failed.exitResult.code, 0, '等待超时必须以非零状态退出');
  await assert.rejects(() => fetch(`${failed.base}/health`), '等待实例不得对外提供服务');
  assert.match(failed.out(), /not acquired within 2s/, '给出“锁等待超时”的明确结论');

  // 等待方在拿不到锁时绝不能自行做 DDL：旧结构保持、原数据保留、未登记。
  // schema_migrations 在锁内创建，等待实例未获锁就退出，因此该表可能尚不存在。
  const pool = await openPool(db);
  assert.equal(await columnExists(pool, 'carbon_factors', 'version'), false, '等待方未重复建列');
  const [[cnt]] = await pool.query('SELECT COUNT(*) c FROM carbon_factors');
  assert.equal(Number(cnt.c), 3, '旧因子数据保留');
  const [[tableRows]] = await pool.query(
    `SELECT COUNT(*) c FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='schema_migrations'`
  );
  if (Number(tableRows.c) === 0) {
    assert.ok(true, '未获锁则尚未创建迁移登记表');
  } else {
    const [[mig]] = await pool.query('SELECT COUNT(*) c FROM schema_migrations');
    assert.equal(Number(mig.c), 0, '没有任何迁移登记');
  }
  await pool.end();

  // 独立连接释放锁后，新实例能在同一持久库上完成升级
  await holder.query('SELECT RELEASE_LOCK(?)', [lockName]);
  await holder.end();
  const ok = await startServer({ database: db, logLevel: 'info' });
  handles.push(ok);
  assert.equal((await (await fetch(`${ok.base}/health`)).json()).status, 'ok');
  const pool2 = await openPool(db);
  await assertVersionedSchema(pool2);
  await uniqueUpgrade(pool2);
  await pool2.end();
});

// ---- 故障 2：持锁 leader 在结构变更中途被强制终止 ---------------------------
test('leader 在首个 DDL 中途被 SIGKILL：剩余实例拿锁后续跑成功，结构与登记唯一', async (t) => {
  const db = 'ct_fault_kill';
  await provisionLegacy(db);
  const lockName = migrationLockName(db);

  // 独立连接持有 carbon_factors 的表元数据锁，使 leader 的第一条 ADD COLUMN 确定性阻塞，
  // 从而把 leader 定格在“已拿迁移锁、结构变更中途”的状态。
  const blocker = await adminConnection(db);
  const monitor = await adminConnection(db);
  t.after(async () => {
    try { await blocker.query('UNLOCK TABLES'); } catch {}
    await blocker.end().catch(() => {});
    await monitor.end().catch(() => {});
  });
  await blocker.query('LOCK TABLES carbon_factors WRITE');

  const leader = await spawnServer({ database: db, logLevel: 'info' });
  handles.push(leader);

  // 第三条独立连接轮询，确认迁移锁确实已被 leader 持有
  const deadline = Date.now() + 20000;
  let holderConnId = null;
  while (Date.now() < deadline) {
    const [rows] = await monitor.query('SELECT IS_USED_LOCK(?) AS id', [lockName]);
    if (rows[0].id != null) { holderConnId = Number(rows[0].id); break; }
    await sleep(200);
  }
  assert.ok(holderConnId, 'leader 已持有迁移锁并卡在 DDL');

  // 此时再起一个真实实例：它应阻塞在同一把咨询锁上
  const survivor = await spawnServer({ database: db, logLevel: 'info', extraEnv: { MIGRATION_LOCK_TIMEOUT: '60' } });
  handles.push(survivor);
  await sleep(1500);
  let survivorHealthy = true;
  try {
    const r = await fetch(`${survivor.base}/health`);
    survivorHealthy = r.ok;
  } catch { survivorHealthy = false; }
  assert.equal(survivorHealthy, false, 'leader 持锁期间，等待实例不对外服务');

  // 强制终止 leader（kill -9）：咨询锁随连接释放，被阻塞的 ALTER 一并中断
  await killServerHard(leader.child);
  // 解除 MDL，幸存者拿到锁后可以继续（连接由 t.after 统一关闭）
  await blocker.query('UNLOCK TABLES');

  await waitForHealthy(survivor, { timeoutMs: 60000 });
  assert.equal((await (await fetch(`${survivor.base}/health`)).json()).status, 'ok');

  // 被强杀的 leader 不再服务
  await assert.rejects(() => fetch(`${leader.base}/health`), '被 kill 的 leader 不监听');

  // 结构升级完整且只发生一次、登记唯一、回填正确
  const pool = await openPool(db);
  await assertVersionedSchema(pool);
  await uniqueUpgrade(pool);
  const [[v1]] = await pool.query(
    `SELECT COUNT(*) c FROM carbon_factors WHERE version=1 AND effective_date='2000-01-01' AND status='active'`
  );
  assert.equal(Number(v1.c), 3, '历史因子回填为 v1');
  const [[a1]] = await pool.query('SELECT carbon_value, factor_version FROM activities WHERE id=1');
  assert.equal(Number(a1.carbon_value).toFixed(2), '5.70');
  assert.equal(a1.factor_version, 1, '历史活动快照回填');
  await pool.end();
});

// ---- 故障 3：重复数据并发两实例都拒绝；修复后并发重启全部恢复 ----------------
test('重复数据时并发两实例都明确拒绝且保数据；修复后并发重启全部成功', async () => {
  const db = 'ct_fault_dup';
  await provisionLegacy(db);
  await mutateRaw(db, (conn) =>
    conn.query(
      `INSERT INTO carbon_factors (id, category, sub_type, factor_value, unit, region)
       VALUES (99, 'energy','electricity', 0.9900, 'kWh','Shanghai')`
    )
  );

  const failed = await startCluster({ database: db, count: 2, expectFailure: true, startupTimeoutMs: 60000 });
  handles.push(...failed.handles);
  for (const code of failed.exitCodes) {
    assert.notEqual(code, '__timeout__');
    assert.notEqual(code, 0, '升级失败时每个实例都非零退出');
  }
  for (const h of failed.handles) {
    await assert.rejects(() => fetch(`${h.base}/health`));
    assert.doesNotMatch(h.out(), /Duplicate column name/i, '失败结论是重复数据而非实例互相重复建列');
  }

  const pool = await openPool(db);
  const [[f4]] = await pool.query('SELECT COUNT(*) c FROM carbon_factors');
  const [[a3]] = await pool.query('SELECT COUNT(*) c FROM activities');
  assert.equal(Number(f4.c), 4);
  assert.equal(Number(a3.c), 3, '所有实例失败期间原数据保留');
  await pool.end();

  // 修复重复数据后，并发重启所有实例 -> 全部恢复
  await mutateRaw(db, (conn) => conn.query('DELETE FROM carbon_factors WHERE id=99'));
  const ok = await startCluster({ database: db, count: 2 });
  handles.push(...ok.handles);
  for (const h of ok.handles) {
    assert.equal((await (await fetch(`${h.base}/health`)).json()).status, 'ok');
    const admin = await login(h.base, 'demo@carbontrack.local');
    const list = await api(h.base, admin.token).get('/factors');
    assert.equal(list.status, 200);
    assert.equal(list.body.length, 3);
  }
  const pool2 = await openPool(db);
  await uniqueUpgrade(pool2);
  await pool2.end();
});
