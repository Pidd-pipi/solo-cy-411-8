import { Migration, MigrationContext } from './types';

// 全新库初始化期间，init.sql 可能尚未建完基础表：这是可重试的瞬时状态。
export const MIGRATION_BASE_TABLES_NOT_READY = 'MIGRATION_BASE_TABLES_NOT_READY';

export class BaseTablesNotReadyError extends Error {
  code = MIGRATION_BASE_TABLES_NOT_READY;
  constructor(table: string) {
    super(`Migration 002 waiting: base table ${table} not created yet (init.sql still running)`);
    this.name = 'BaseTablesNotReadyError';
  }
}

function baseTablesNotReady(table: string): BaseTablesNotReadyError {
  return new BaseTablesNotReadyError(table);
}

/**
 * 002：碳因子版本与生效期。
 * 同一套步骤同时服务：
 *  - 旧库升级（缺 version/effective_date/status 与活动快照列）→ 补齐 + 回填 + 加约束；
 *  - 新库（init.sql 已建好完整结构）→ 每一步探测到结构已存在即跳过。
 * 全部为 additive 变更，不删除/不覆盖业务数据；任何一步报错都会中断启动且原数据保留。
 */
export const migration002FactorVersions: Migration = {
  id: '002_factor_versions',
  description: 'Versioned carbon factors with effective dates and pinned activity snapshots',
  async up(ctx: MigrationContext) {
    if (!(await ctx.tableExists('carbon_factors'))) {
      throw baseTablesNotReady('carbon_factors');
    }
    if (!(await ctx.tableExists('activities'))) {
      throw baseTablesNotReady('activities');
    }

    // 1) carbon_factors 新列。effective_date 先以可空加入，回填后再收紧为 NOT NULL。
    await ctx.addColumnIfMissing('carbon_factors', 'version', "ADD COLUMN `version` INT NOT NULL DEFAULT 1");
    await ctx.addColumnIfMissing('carbon_factors', 'effective_date', "ADD COLUMN `effective_date` DATE NULL");
    await ctx.addColumnIfMissing(
      'carbon_factors',
      'status',
      "ADD COLUMN `status` ENUM('active','inactive') NOT NULL DEFAULT 'active'"
    );
    await ctx.addColumnIfMissing(
      'carbon_factors',
      'created_at',
      "ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP"
    );

    // 2) 旧因子回填：视为 2000-01-01 起生效的 v1，覆盖所有历史活动日期。
    await ctx.query("UPDATE carbon_factors SET effective_date = '2000-01-01' WHERE effective_date IS NULL");

    // 收紧 effective_date 为 NOT NULL（幂等：已经是 NOT NULL 则跳过 MODIFY）。
    const effCol = await ctx.query(
      "SELECT IS_NULLABLE AS nullable FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'carbon_factors' AND COLUMN_NAME = 'effective_date'"
    );
    if (effCol?.[0]?.nullable === 'YES') {
      await ctx.query('ALTER TABLE carbon_factors MODIFY COLUMN `effective_date` DATE NOT NULL');
    }

    // 3) 加唯一约束前先检测存量冲突：有冲突就明确失败、保留原数据，
    //    避免 ALTER 在半路上因 1062 失败留下难以判断的状态。
    const dupDate = await ctx.query(
      `SELECT region, category, sub_type, effective_date, COUNT(*) AS c
       FROM carbon_factors
       GROUP BY region, category, sub_type, effective_date HAVING c > 1 LIMIT 1`
    );
    if (dupDate.length) {
      const d = dupDate[0];
      throw new Error(
        `Migration 002 aborted: duplicate factor versions for ${d.region}/${d.category}/${d.sub_type} @ ${d.effective_date} (count=${d.c}); resolve duplicates and restart`
      );
    }
    const dupVersion = await ctx.query(
      `SELECT region, category, sub_type, version, COUNT(*) AS c
       FROM carbon_factors
       GROUP BY region, category, sub_type, version HAVING c > 1 LIMIT 1`
    );
    if (dupVersion.length) {
      const d = dupVersion[0];
      throw new Error(
        `Migration 002 aborted: duplicate factor version numbers for ${d.region}/${d.category}/${d.sub_type} v${d.version} (count=${d.c}); resolve duplicates and restart`
      );
    }

    // 4) 唯一约束 + 匹配索引（已存在则跳过；并发/重复升级不会重建）。
    await ctx.addIndexIfMissing(
      'carbon_factors',
      'uk_factor_version',
      'ADD CONSTRAINT uk_factor_version UNIQUE KEY (region, category, sub_type, effective_date)'
    );
    await ctx.addIndexIfMissing(
      'carbon_factors',
      'uk_factor_version_no',
      'ADD CONSTRAINT uk_factor_version_no UNIQUE KEY (region, category, sub_type, version)'
    );
    await ctx.addIndexIfMissing(
      'carbon_factors',
      'idx_factor_match',
      'ADD KEY idx_factor_match (region, category, sub_type, status, effective_date)'
    );

    // 5) activities 固化快照列。
    await ctx.addColumnIfMissing('activities', 'factor_version', 'ADD COLUMN `factor_version` INT NULL');
    await ctx.addColumnIfMissing(
      'activities',
      'factor_value_snapshot',
      'ADD COLUMN `factor_value_snapshot` DECIMAL(12,4) NULL'
    );
    await ctx.addColumnIfMissing(
      'activities',
      'factor_effective_date',
      'ADD COLUMN `factor_effective_date` DATE NULL'
    );

    // 6) 历史活动按当时引用的因子回填快照（全部视作 v1）；已是固化数据的行不覆盖。
    await ctx.query(
      `UPDATE activities a
       JOIN carbon_factors f ON f.id = a.factor_id
       SET a.factor_version = COALESCE(a.factor_version, f.version),
           a.factor_value_snapshot = COALESCE(a.factor_value_snapshot, f.factor_value),
           a.factor_effective_date = COALESCE(a.factor_effective_date, f.effective_date)
       WHERE a.factor_id IS NOT NULL
         AND (a.factor_version IS NULL OR a.factor_value_snapshot IS NULL OR a.factor_effective_date IS NULL)`
    );
  }
};

export const migrations: Migration[] = [migration002FactorVersions];
