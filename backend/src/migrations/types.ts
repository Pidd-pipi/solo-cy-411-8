import { DataSource } from 'typeorm';

/**
 * 迁移上下文：所有结构变更都先查 information_schema 再决定是否执行，
 * 因此同一步骤在“全新库（init.sql 已建结构）”与“旧库（缺字段）”上都安全可重入。
 */
export interface MigrationContext {
  readonly dataSource: DataSource;
  query(sql: string, params?: unknown[]): Promise<any>;
  tableExists(table: string): Promise<boolean>;
  columnExists(table: string, column: string): Promise<boolean>;
  indexExists(table: string, index: string): Promise<boolean>;
  /** 列不存在才 ADD COLUMN，已存在则跳过（不丢数据）。 */
  addColumnIfMissing(table: string, column: string, ddl: string): Promise<boolean>;
  addIndexIfMissing(table: string, index: string, ddl: string): Promise<boolean>;
}

export interface Migration {
  id: string;
  description: string;
  up(ctx: MigrationContext): Promise<void>;
}
