'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const dayjs = require('dayjs');
const {
  provisionFresh,
  openPool,
  startServer,
  stopServer,
  mutateRaw,
  api,
  login
} = require('./helpers');

const iso = (d) => dayjs(d).format('YYYY-MM-DD');
const today = iso();
const future = (n) => iso(dayjs().add(n, 'day'));
const past = (n = 1) => iso(dayjs().subtract(n, 'day'));

let srv;
let admin;
let member;
let pool;
let v2Id;

before(async () => {
  // 全新库：init.sql 基础结构 -> 启动迁移到版本化（真实持久化流程）
  await provisionFresh('ct_biz');
  srv = await startServer({ database: 'ct_biz' });
  admin = await login(srv.base, 'demo@carbontrack.local');
  member = await login(srv.base, 'river@carbontrack.local');
  pool = await openPool('ct_biz');
});

after(async () => {
  if (pool) await pool.end().catch(() => {});
  if (srv) await stopServer(srv.child);
});

const adminApi = () => api(srv.base, admin.token);
const memberApi = () => api(srv.base, member.token);

async function findActivityById(id) {
  const [rows] = await pool.query('SELECT * FROM activities WHERE id=?', [id]);
  return rows[0];
}

// ---- 权限：缺失 / 普通成员不能管理因子 --------------------------------------
test('权限：无令牌 401，普通成员发布/停用被 403，成员可只读列表', async () => {
  assert.equal((await api(srv.base).get('/factors')).status, 401);
  assert.equal((await api(srv.base).post('/factors', {})).status, 401);

  const validPublish = {
    category: 'energy', subType: 'perm-probe', factorValue: 1, unit: 'kWh',
    region: 'Shanghai', effectiveDate: future(40)
  };
  const denied = await memberApi().post('/factors', validPublish);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'RBAC_ROLE_DENIED');

  const deniedStatus = await memberApi().patch('/factors/3/status', { status: 'inactive' });
  assert.equal(deniedStatus.status, 403);

  const list = await memberApi().get('/factors');
  assert.equal(list.status, 200);
});

// ---- 非法日期 ---------------------------------------------------------------
test('非法日期：过去日期/坏格式发布被 400，未来版本改成过去日期也被 400', async () => {
  const base = { category: 'energy', subType: 'bad-date', factorValue: 0.4, unit: 'kWh', region: 'Shanghai' };

  const yesterday = await adminApi().post('/factors', { ...base, effectiveDate: past() });
  assert.equal(yesterday.status, 400);
  assert.equal(yesterday.body.code, 'FACTOR_EFFECTIVE_DATE_INVALID');

  const malformed = await adminApi().post('/factors', { ...base, effectiveDate: 'not-a-date' });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.code, 'FACTOR_EFFECTIVE_DATE_INVALID');

  const created = await adminApi().post('/factors', { ...base, subType: 'bad-date-f', effectiveDate: future(35) });
  assert.ok(created.status === 200 || created.status === 201);
  const toPast = await adminApi().patch(`/factors/${created.body.factor.id}`, { effectiveDate: past() });
  assert.equal(toPast.status, 400);
  assert.equal(toPast.body.code, 'FACTOR_EFFECTIVE_DATE_INVALID');
});

// ---- 同一身份日期重叠：顺序发布第二次被拒绝 ---------------------------------
test('同一身份同一生效日期重叠发布返回 409，不同日期可继续发布', async () => {
  const identity = { category: 'shopping', subType: 'overlap-probe', factorValue: 1.1, unit: 'item', region: 'Shanghai' };
  const d1 = future(50);
  const first = await adminApi().post('/factors', { ...identity, effectiveDate: d1 });
  assert.ok(first.status === 200 || first.status === 201);
  assert.equal(first.body.factor.version, 1);

  const second = await adminApi().post('/factors', { ...identity, factorValue: 2.2, effectiveDate: d1 });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, 'FACTOR_VERSION_CONFLICT');

  const otherDate = await adminApi().post('/factors', { ...identity, factorValue: 2.2, effectiveDate: future(51) });
  assert.ok(otherDate.status === 200 || otherDate.status === 201);
  assert.equal(otherDate.body.factor.version, 2, '版本号按发布顺序递增');

  const [[cnt]] = await pool.query(
    `SELECT COUNT(*) c FROM carbon_factors
     WHERE region='Shanghai' AND category='shopping' AND sub_type='overlap-probe' AND effective_date=?`,
    [d1]
  );
  assert.equal(Number(cnt.c), 1, '重叠日期真实库里仍只有一条');
});

// ---- 并发发布同一日期：只能成功一次 ------------------------------------------
test('并发发布同一身份日期：恰有一次成功，另一次 409，库里只有一条', async () => {
  const body = {
    category: 'food', subType: 'race-probe', factorValue: 3.3, unit: 'meal',
    region: 'Beijing', effectiveDate: future(55)
  };
  const [a, b] = await Promise.all([
    adminApi().post('/factors', body),
    adminApi().post('/factors', body)
  ]);
  const success = [a, b].filter((r) => r.status === 200 || r.status === 201);
  const conflicts = [a, b].filter((r) => r.status === 409);
  assert.equal(success.length, 1, `并发同日期只成功一次，实际成功 ${success.length}（${a.status}/${b.status}）`);
  assert.equal(conflicts.length, 1, '另一次被 409 拒绝');
  const ok = success[0];
  const conflict = conflicts[0];
  assert.equal(conflict.body.code, 'FACTOR_VERSION_CONFLICT');
  assert.equal(ok.body.factor.version, 1);

  const [[cnt]] = await pool.query(
    `SELECT COUNT(*) c FROM carbon_factors
     WHERE region='Beijing' AND category='food' AND sub_type='race-probe' AND effective_date=?`,
    [future(55)]
  );
  assert.equal(Number(cnt.c), 1);
});

// ---- 按活动日期取“当时生效”的因子并固化 -------------------------------------
test('按活动日期匹配因子：今天用 v1，未来日用 v2，且各自固化版本快照', async () => {
  // 上海 electricity 种子 v1=0.57 @2000；发布 v2=0.61 @未来20天
  const publishV2 = await adminApi().post('/factors', {
    category: 'energy', subType: 'electricity', factorValue: 0.61, unit: 'kWh',
    region: 'Shanghai', effectiveDate: future(20)
  });
  assert.ok(publishV2.status === 200 || publishV2.status === 201);
  assert.equal(publishV2.body.factor.version, 2);
  v2Id = Number(publishV2.body.factor.id);

  const actToday = await adminApi().post('/activities', {
    category: 'energy', subType: 'electricity', amount: 100, unit: 'kWh',
    recordDate: today, note: 'pin-v1'
  });
  assert.ok(actToday.status === 200 || actToday.status === 201);
  assert.equal(Number(actToday.body.activity.carbonValue).toFixed(2), '57.00', '今天的活动按 v1 0.57 计算');
  assert.equal(actToday.body.activity.factorVersion, 1);
  const rowToday = await findActivityById(Number(actToday.body.activity.id));
  assert.equal(rowToday.factor_version, 1);
  assert.equal(Number(rowToday.factor_value_snapshot).toFixed(4), '0.5700');

  const actFuture = await adminApi().post('/activities', {
    category: 'energy', subType: 'electricity', amount: 100, unit: 'kWh',
    recordDate: future(20), note: 'pin-v2'
  });
  assert.ok(actFuture.status === 200 || actFuture.status === 201);
  assert.equal(Number(actFuture.body.activity.carbonValue).toFixed(2), '61.00', '未来日期的活动按 v2 0.61 计算');
  assert.equal(Number(actFuture.body.activity.factorId), v2Id);
  assert.equal(actFuture.body.activity.factorVersion, 2);
});

// ---- 修正未生效版本；已生效版本/不存在版本被拒 -------------------------------
test('修正：可改未生效版本；已生效版本 409；不存在版本 404；非法状态 400', async () => {
  const created = await adminApi().post('/factors', {
    category: 'transport', subType: 'amend-probe', factorValue: 0.30, unit: 'km',
    region: 'Shanghai', effectiveDate: future(70)
  });
  const id = Number(created.body.factor.id);

  const amended = await adminApi().patch(`/factors/${id}`, { factorValue: 0.31, effectiveDate: future(71) });
  assert.ok(amended.status === 200);
  assert.equal(Number(amended.body.factor.factorValue).toFixed(4), '0.3100');

  // 已被未来活动引用的 v2 不能修正（0.61 electricity 已被 pin-v2 固化）
  const amendReferenced = await adminApi().patch(`/factors/${v2Id}`, { factorValue: 0.99 });
  assert.equal(amendReferenced.status, 409);
  assert.equal(amendReferenced.body.code, 'FACTOR_VERSION_REFERENCED');

  // 种子 v1（2000 生效）已生效，锁定不可修正
  const locked = await adminApi().patch('/factors/3', { factorValue: 0.99 });
  assert.equal(locked.status, 409);
  assert.equal(locked.body.code, 'FACTOR_VERSION_EFFECTIVE');

  // 不存在的版本
  const missing = await adminApi().patch('/factors/999999', { factorValue: 1 });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.code, 'FACTOR_NOT_FOUND');
  const missingStatus = await adminApi().patch('/factors/999999/status', { status: 'active' });
  assert.equal(missingStatus.status, 404);

  const badStatus = await adminApi().patch(`/factors/${id}/status`, { status: 'bogus' });
  assert.equal(badStatus.status, 400);
  assert.ok(String(badStatus.body.code).startsWith('FACTOR_STATUS_INVALID'), `实际 code=${badStatus.body.code}`);
});

// ---- 停用/发布不改变旧活动快照；仪表盘/目标/排行用固化值 ----------------------
test('停用版本与再发布不改变旧活动；排行与目标始终使用固化 carbon_value', async () => {
  const rankBefore = await adminApi().get('/ranking?region=Shanghai');
  const demoBefore = rankBefore.body.find((r) => r.username === 'demo');

  const goal = await adminApi().post('/goals', {
    title: 'regression goal', targetValue: 100000, periodType: 'range',
    startDate: past(1), endDate: future(80), status: 'active'
  });
  const goalId = Number(goal.body.goal.id);
  const goalsList1 = await adminApi().get('/goals');
  const g1 = goalsList1.body.find((x) => Number(x.id) === goalId);
  const progressBefore = Number(g1.currentValue);
  assert.ok(progressBefore > 0);

  const pinV1Before = await findActivityById(
    (await pool.query("SELECT id FROM activities WHERE note='pin-v1' LIMIT 1"))[0][0].id
  );

  // 停用 v1 与 v2；旧活动 carbon_value/快照必须原样
  const d1 = await adminApi().patch('/factors/3/status', { status: 'inactive' });
  assert.equal(d1.status, 200);
  const d2 = await adminApi().patch(`/factors/${v2Id}/status`, { status: 'inactive' });
  assert.equal(d2.status, 200);

  const pinV1After = await findActivityById(pinV1Before.id);
  assert.equal(Number(pinV1After.carbon_value).toFixed(2), '57.00', '停用后旧活动 carbon_value 不变');
  assert.equal(pinV1After.factor_version, 1);
  assert.equal(Number(pinV1After.factor_value_snapshot).toFixed(4), '0.5700');

  const rankAfter = await adminApi().get('/ranking?region=Shanghai');
  const demoAfter = rankAfter.body.find((r) => r.username === 'demo');
  assert.equal(demoAfter.totalCarbon, demoBefore.totalCarbon, '停用版本后排行榜固化总量不变');

  const goalsList2 = await adminApi().get('/goals');
  const g2 = goalsList2.body.find((x) => Number(x.id) === goalId);
  assert.equal(Number(g2.currentValue), progressBefore, '停用版本后目标进度固化值不变');

  // 停用期间，按今天日期无法再匹配该因子 -> 新活动 404
  const noMatch = await adminApi().post('/activities', {
    category: 'energy', subType: 'electricity', amount: 1, unit: 'kWh',
    recordDate: today, note: 'should-fail'
  });
  assert.equal(noMatch.status, 404);
  assert.equal(noMatch.body.code, 'FACTOR_NOT_FOUND');

  // 重新启用后恢复匹配；再发布新版本也不回写旧活动
  const re1 = await adminApi().patch('/factors/3/status', { status: 'active' });
  assert.equal(re1.status, 200);
  await adminApi().patch(`/factors/${v2Id}/status`, { status: 'active' });

  const republish = await adminApi().post('/factors', {
    category: 'energy', subType: 'electricity', factorValue: 0.99, unit: 'kWh',
    region: 'Shanghai', effectiveDate: future(120)
  });
  assert.ok(republish.status === 200 || republish.status === 201);

  const pinV1Final = await findActivityById(pinV1Before.id);
  assert.equal(Number(pinV1Final.carbon_value).toFixed(2), '57.00', '再发布新版本后旧活动仍不变');
});

// ---- 连续运行一致性：再次启动同一持久库，固化结果与版本数量保持稳定 -----------
test('重启后再次读取：结构、固化结果与迁移登记保持一致（可重复运行）', async () => {
  await stopServer(srv.child);
  srv = await startServer({ database: 'ct_biz' });
  admin = await login(srv.base, 'demo@carbontrack.local');
  const row = (await pool.query("SELECT carbon_value, factor_version FROM activities WHERE note='pin-v1' LIMIT 1"))[0][0];
  assert.equal(Number(row.carbon_value).toFixed(2), '57.00');
  assert.equal(row.factor_version, 1);
  const [[mig]] = await pool.query("SELECT COUNT(*) c FROM schema_migrations WHERE id='002_factor_versions'");
  assert.equal(Number(mig.c), 1);
});
