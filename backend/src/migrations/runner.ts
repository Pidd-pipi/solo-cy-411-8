import { createHash } from 'node:crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { logTemplate } from '../utils/logger';
import { migrations } from './002_factor_versions';
import { MigrationContext } from './types';

// 多实例共用同一数据源时，用 MySQL 咨询锁把“结构变更”串行化：
// 同一时刻只有一个实例执行 DDL，其余实例阻塞在 GET_LOCK 上等待，
// 拿到锁后复查 schema_migrations 直接复用结果，绝不重复建列/建索引。
const LOCK_WAIT_TIMEOUT_SECONDS = Number(process.env.MIGRATION_LOCK_TIMEOUT || 120);

// GET_LOCK 名称上限 64 字符；按库名哈希，使不同数据源互不阻塞。
// 导出供运维/回归测试用同一真实来源计算锁名，避免算法在多处复制后漂移。
export function migrationLockName(database: string): string {
  return `ct_migrate_${createHash('sha1').update(String(database)).digest('hex').slice(0, 40)}`;
}

async function countRows(qr: QueryRunner, sql: string, params: unknown[] = []): Promise<number> {
  const rows: unknown = await qr.query(sql, params);
  return Number((Array.isArray(rows) ? (rows as any[])[0]?.cnt : 0) ?? 0);
}

function columnExists(qr: QueryRunner, table: string, column: string): Promise<boolean> {
  return countRows(
    qr,
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  ).then((n) => n > 0);
}

function indexExists(qr: QueryRunner, table: string, index: string): Promise<boolean> {
  return countRows(
    qr,
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     GROUP BY INDEX_NAME`,
    [table, index]
  ).then((n) => n > 0);
}

function tableExists(qr: QueryRunner, table: string): Promise<boolean> {
  return countRows(
    qr,
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  ).then((n) => n > 0);
}

function buildContext(qr: QueryRunner): MigrationContext {
  const query = (sql: string, params: unknown[] = []) => qr.query(sql, params);
  return {
    dataSource: qr.manager.connection,
    query,
    tableExists: (table) => tableExists(qr, table),
    columnExists: (table, column) => columnExists(qr, table, column),
    indexExists: (table, index) => indexExists(qr, table, index),

    addColumnIfMissing: async (table, column, ddl) => {
      if (await columnExists(qr, table, column)) return false;
      // ddl 形如 "ADD COLUMN `x` INT ..."，来自内置迁移常量（非用户输入），可安全拼接。
      await query(`ALTER TABLE \`${table}\` ${ddl}`);
      logTemplate('info', 'MIGRATION_DDL', { table, object: column });
      return true;
    },

    addIndexIfMissing: async (table, index, ddl) => {
      if (await indexExists(qr, table, index)) return false;
      await query(`ALTER TABLE \`${table}\` ${ddl}`);
      logTemplate('info', 'MIGRATION_DDL', { table, object: index });
      return true;
    }
  };
}

/**
 * 应用启动迁移运行器（多实例安全）：
 * - schema_migrations 记录已完成版本，重复升级直接跳过，不重复建结构；
 * - 每条 DDL 前先查 information_schema，单实例层面也幂等；
 * - 集群层面用命名咨询锁保证同一数据源只有一个实例执行结构变更，其余实例等待并复用；
 * - 任一迁移抛错都向上抛出（持锁者与等待者都会得到明确失败），由 main.ts 终止进程：
 *   不监听端口、不带缺字段状态运行。变更均为 additive，修复数据后重启可续跑。
 */
export class MigrationRunner {
  async run(dataSource: DataSource): Promise<void> {
    const dbName = (dataSource.options as { database?: string }).database || 'default';
    const lockName = migrationLockName(dbName);

    // 专用连接持有咨询锁：MySQL 命名锁是“连接级”的，必须在同一连接上 GET/RELEASE，
    // 因此整个迁移过程都在这一个 QueryRunner 连接内完成。
    const qr = dataSource.createQueryRunner();
    let lockHeld = false;
    try {
      const acquiredRows = await qr.query('SELECT GET_LOCK(?, ?) AS acquired', [lockName, LOCK_WAIT_TIMEOUT_SECONDS]);
      if (Number(acquiredRows?.[0]?.acquired ?? 0) !== 1) {
        logTemplate('error', 'MIGRATION_LOCK_TIMEOUT', { timeout: LOCK_WAIT_TIMEOUT_SECONDS });
        throw new Error(
          `migration lock "${lockName}" not acquired within ${LOCK_WAIT_TIMEOUT_SECONDS}s; ` +
            `another instance may be stuck upgrading the schema`
        );
      }
      lockHeld = true;

      // 版本登记表也在锁内创建（IF NOT EXISTS 幂等）：持锁者建好后等待者拿锁时表必已存在，
      // 避免多个实例在锁外并发执行同一条 CREATE TABLE DDL。
      await qr.query(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
           id VARCHAR(128) PRIMARY KEY,
           description VARCHAR(255) NOT NULL,
           applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );

      for (const migration of migrations) {
        const recorded = await qr.query('SELECT id FROM schema_migrations WHERE id = ? FOR UPDATE', [migration.id]);
        if (Array.isArray(recorded) && recorded.length > 0) {
          // 等待方路径：持锁实例已完成该版本，直接复用同一结果。
          logTemplate('info', 'MIGRATION_LOCK_ACQUIRED', { name: lockName, role: 'waiter' });
          logTemplate('info', 'MIGRATION_SKIP', { id: migration.id });
          continue;
        }

        // 持锁执行方路径：本实例负责真正的结构变更。
        logTemplate('info', 'MIGRATION_LOCK_ACQUIRED', { name: lockName, role: 'leader' });
        logTemplate('info', 'MIGRATION_START', { id: migration.id, description: migration.description });
        try {
          // DDL 由 MySQL 隐式提交；步骤本身幂等，失败后重跑不会重复建结构或丢数据。
          await migration.up(buildContext(qr));
          await qr.query('INSERT INTO schema_migrations (id, description) VALUES (?, ?)', [
            migration.id,
            migration.description
          ]);
          logTemplate('info', 'MIGRATION_SUCCESS', { id: migration.id });
        } catch (error) {
          // 持锁者失败：记录明确结论并向上抛，main.ts 让本实例退出；
          // 不写入 schema_migrations，等待者随后拿到锁会自行重试（幂等），同样得到明确结论。
          logTemplate('error', 'MIGRATION_FAILED', { id: migration.id, reason: (error as Error)?.message });
          throw error;
        }
      }
    } finally {
      if (lockHeld) {
        try {
          await qr.query('SELECT RELEASE_LOCK(?)', [lockName]);
          logTemplate('info', 'MIGRATION_LOCK_RELEASED', { name: lockName });
        } catch {
          // 释放失败不影响迁移结论；连接关闭时 MySQL 也会自动回收命名锁。
        }
      }
      await qr.release();
    }
  }
}
