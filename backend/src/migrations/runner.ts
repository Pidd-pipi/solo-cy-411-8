import { DataSource } from 'typeorm';
import { logTemplate } from '../utils/logger';
import { migrations } from './002_factor_versions';
import { MigrationContext } from './types';

async function countRows(dataSource: DataSource, sql: string, params: unknown[] = []): Promise<number> {
  const rows = await dataSource.query(sql, params);
  return Number((Array.isArray(rows) ? rows[0]?.cnt : 0) ?? 0);
}

function columnExists(dataSource: DataSource, table: string, column: string): Promise<boolean> {
  return countRows(
    dataSource,
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  ).then((n) => n > 0);
}

function indexExists(dataSource: DataSource, table: string, index: string): Promise<boolean> {
  return countRows(
    dataSource,
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?
     GROUP BY INDEX_NAME`,
    [table, index]
  ).then((n) => n > 0);
}

function tableExists(dataSource: DataSource, table: string): Promise<boolean> {
  return countRows(
    dataSource,
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  ).then((n) => n > 0);
}

/**
 * 应用启动迁移运行器：
 * - schema_migrations 记录已完成版本，重复升级直接跳过，不会重复建结构；
 * - 每个结构变更前先查 information_schema，双保险实现幂等；
 * - 任一迁移抛错都向上抛出，由 main.ts 终止进程（不监听端口、不带缺字段状态运行）。
 */
export class MigrationRunner {
  async run(dataSource: DataSource): Promise<void> {
    await dataSource.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         id VARCHAR(128) PRIMARY KEY,
         description VARCHAR(255) NOT NULL,
         applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    for (const migration of migrations) {
      const recorded = await dataSource.query('SELECT id FROM schema_migrations WHERE id = ?', [migration.id]);
      if (Array.isArray(recorded) && recorded.length > 0) {
        logTemplate('info', 'MIGRATION_SKIP', { id: migration.id });
        continue;
      }

      logTemplate('info', 'MIGRATION_START', { id: migration.id, description: migration.description });
      const ctx = this.buildContext(dataSource);
      // DDL 由 MySQL 隐式提交；步骤本身幂等，失败后重跑不会重复建结构或丢数据。
      await migration.up(ctx);
      await dataSource.query('INSERT INTO schema_migrations (id, description) VALUES (?, ?)', [
        migration.id,
        migration.description
      ]);
      logTemplate('info', 'MIGRATION_SUCCESS', { id: migration.id });
    }
  }

  private buildContext(dataSource: DataSource): MigrationContext {
    const query = (sql: string, params: unknown[] = []) => dataSource.query(sql, params);
    return {
      dataSource,
      query,
      tableExists: (table) => tableExists(dataSource, table),
      columnExists: (table, column) => columnExists(dataSource, table, column),
      indexExists: (table, index) => indexExists(dataSource, table, index),

      addColumnIfMissing: async (table, column, ddl) => {
        if (await columnExists(dataSource, table, column)) return false;
        // ddl 形如 "ADD COLUMN `x` INT ..."，来自内置迁移常量（非用户输入），可安全拼接。
        await query(`ALTER TABLE \`${table}\` ${ddl}`);
        logTemplate('info', 'MIGRATION_DDL', { table, object: column });
        return true;
      },

      addIndexIfMissing: async (table, index, ddl) => {
        if (await indexExists(dataSource, table, index)) return false;
        await query(`ALTER TABLE \`${table}\` ${ddl}`);
        logTemplate('info', 'MIGRATION_DDL', { table, object: index });
        return true;
      }
    };
  }
}
