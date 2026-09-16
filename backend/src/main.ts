import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from './app.module';
import { appConfig } from './config/app';
import { MIGRATION_BASE_TABLES_NOT_READY } from './migrations/002_factor_versions';
import { MigrationRunner } from './migrations/runner';
import { logger } from './utils/logger';

const STARTUP_RETRIES = 30;
const RETRY_DELAY_MS = 2000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function bootstrap() {
  let app: INestApplication;
  try {
    // 阶段一：建立连接（数据库进程可能刚启动，仅瞬时网络错误重试）。
    app = await createAppWithRetry();
    // 阶段二：在同一个 DataSource 上跑迁移；全新库 init.sql 未建完基础表时有限重试。
    const dataSource = app.get(DataSource);
    let migrated = false;
    for (let attempt = 1; attempt <= STARTUP_RETRIES && !migrated; attempt += 1) {
      try {
        await new MigrationRunner().run(dataSource);
        migrated = true;
      } catch (error: any) {
        const code = error?.code || error?.driverError?.code;
        if (code === MIGRATION_BASE_TABLES_NOT_READY && attempt < STARTUP_RETRIES) {
          logger.warn(`startup waiting for init.sql base tables (attempt ${attempt}/${STARTUP_RETRIES}): ${error?.message || code}`);
          await sleep(RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
    }
    if (!migrated) {
      throw new Error('startup aborted: database migration did not become ready within retry window');
    }
  } catch (error) {
    // 迁移失败（例如存量数据违反唯一约束、无法修复的缺列/SQL 错误）必须停止服务：
    // 不监听端口，绝不带着缺字段的库继续对外服务。变更均为 additive，原数据保留。
    logger.error(`backend startup aborted: migration failed, refusing to start. ${(error as Error)?.stack || error}`);
    process.exit(1);
  }

  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));
  await app.listen(appConfig.port);
  logger.info(`CarbonTrack backend listening on port ${appConfig.port}`);
}

async function createAppWithRetry(): Promise<INestApplication> {
  for (let attempt = 1; attempt <= STARTUP_RETRIES; attempt += 1) {
    try {
      // TypeOrmModule.forRoot 在此建立连接；旧库/新库都靠随后的迁移统一到最新结构。
      return await NestFactory.create(AppModule);
    } catch (error: any) {
      const code = error?.code || error?.driverError?.code;
      const transient = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST', 'ER_LOCK_WAIT_TIMEOUT'];
      logger.error(`startup: cannot connect to database (attempt ${attempt}/${STARTUP_RETRIES}): ${error?.message || error}`);
      if (attempt === STARTUP_RETRIES || !transient.includes(code)) throw error;
      await sleep(RETRY_DELAY_MS);
    }
  }
  throw new Error('startup: exhausted database connection retries');
}

void bootstrap();
