# CarbonTrack 碳足迹追踪平台

CarbonTrack 是面向个人与小微企业的碳排放记录、分析、目标管理和排行榜全栈 Web 应用。

## Docker Compose 一键启动（首选）

```bash
cp .env.example .env
docker compose up -d
```

访问地址：

- 前端：http://localhost:18411
- 后端健康检查：http://localhost:19411/health
- MySQL：localhost:3306

停止服务：

```bash
docker compose down
```

## 主要功能

- 用户注册、登录、JWT 认证和 RBAC 权限校验
- 活动记录新增、编辑、删除、分类筛选和分页列表
- CarbonFactor **版本化与生效期**：管理员可发布未来生效的新区域因子、修正尚未生效的版本、停用/重新启用版本
- 新增或修改活动时按**活动日期**匹配当时生效的因子版本并固化（factor_version、因子值快照、生效日期），后续发布或停用不会改变旧活动的 `carbon_value`
- 同一地区 + 分类 + 子类型在任一日期至多一个生效版本，重叠发布返回 409，并发发布由数据库唯一约束保证只成功一次
- 仪表盘展示今日、本周、本月碳排放和趋势图
- 目标管理展示目标完成进度和到期区间
- 排行榜按地区和时间段查看用户低碳排名（均使用各活动固化结果）
- 管理员查看操作审计日志

## 本地开发方式（备选）

```bash
cd backend
npm install
npm run dev
```

```bash
cd frontend
npm install
npm run dev
```

本地开发时前端 Vite 会把 `/api` 代理到 `http://localhost:19411`。生产 Docker 中由 Nginx 将 `/api/` 反向代理到 `http://backend:3000/`，前端代码不硬编码 localhost。

### 因子版本回归测试（真实数据库 + 真实进程）

回归测试不使用内存替身：用真实 MySQL/MariaDB，并 `spawn` 真实的 `dist/main.js` 发真实 HTTP 请求，覆盖空库初始化、旧库升级、重复启动幂等、迁移冲突阻断启动、重叠/并发发布、按活动日期固化、停用与再发布不改旧快照、权限与非法日期等。详见 [`backend/test/regression/README.md`](backend/test/regression/README.md)。

```bash
cd backend
npm run build
npm run provision:mysql      # 优先 docker mysql:8.0；无 docker 时回退用户态 MariaDB；或设 MYSQL_TEST_EXTERNAL=1 用外部库
npm run test:regression      # 可重复运行
```

## 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Ant Design、ECharts、Zustand、Axios、dayjs |
| 后端 | NestJS、TypeScript、TypeORM、class-validator、bcryptjs、JWT、winston |
| 数据库 | MySQL 8.0 |
| 部署 | Docker Compose、Nginx 多阶段构建 |

## 项目目录结构

```text
.
├── docker-compose.yml
├── .env
├── .env.example
├── database/
│   └── init.sql            # 仅空数据卷首次初始化的基础结构（v1）
├── backend/
│   ├── Dockerfile
│   └── src/
│       ├── migrations/     # 启动时幂等迁移（新库/旧库同一套流程）
│       ├── routes/
│       ├── controllers/
│       ├── services/
│       ├── models/
│       ├── middlewares/
│       ├── utils/
│       ├── types/
│       ├── constants/
│       └── config/
└── frontend/
    ├── Dockerfile
    ├── nginx.conf
    └── src/
        ├── api/
        ├── stores/
        ├── types/
        ├── components/common/
        ├── hooks/
        ├── pages/
        ├── router/
        ├── utils/
        └── constants/
```

## 环境变量说明

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | `carbontrack` | Compose 项目名和容器名前缀 |
| `DB_NAME` | `carbontrack_db` | MySQL 数据库名 |
| `DB_USER` | `carbontrack_user` | MySQL 应用用户 |
| `DB_PASSWORD` | `carbontrack_pwd` | MySQL 应用密码 |
| `DB_ROOT_PASSWORD` | `carbontrack_root` | MySQL root 密码 |
| `JWT_SECRET` | `change_me_to_a_long_random_string` | JWT 签名密钥 |
| `FRONTEND_PORT` | `18411` | 前端端口映射 |
| `BACKEND_PORT` | `19411` | 后端端口映射 |
| `DB_PORT` | `3306` | 数据库端口映射 |

## Docker 部署说明

- `docker-compose.yml` 顶层声明 `name: carbontrack`，没有 `version:` 字段。
- 容器名带 `${COMPOSE_PROJECT_NAME:-carbontrack}` 前缀。
- 数据库使用命名卷 `carbontrack_mysql_data`，不绑定到中文路径。
- `db` 配置 healthcheck，`backend` 等待数据库 healthy，`frontend` 等待后端 healthy。
- 前端暴露 `18411:80`，后端暴露 `19411:3000`，数据库暴露 `3306:3306`。
- 如端口冲突，修改 `.env` 中 `FRONTEND_PORT`、`BACKEND_PORT`、`DB_PORT` 后重新执行 `docker compose up -d`。

## 核心实体贯穿全栈

- User：`database/init.sql` → `backend/src/models/user.ts` → `backend/src/services/userService.ts` → `backend/src/controllers/userController.ts` → `backend/src/routes/users.ts` → `frontend/src/api/user.ts` → `frontend/src/stores/userStore.ts` → `frontend/src/pages/Profile.tsx`
- Activity：`database/init.sql` → `backend/src/models/activity.ts` → `backend/src/services/activityService.ts` → `backend/src/controllers/activityController.ts` → `backend/src/routes/activities.ts` → `frontend/src/api/activity.ts` → `frontend/src/stores/activityStore.ts` → `frontend/src/pages/Activities.tsx`
- Goal：`database/init.sql` → `backend/src/models/goal.ts` → `backend/src/services/goalService.ts` → `backend/src/controllers/goalController.ts` → `backend/src/routes/goals.ts` → `frontend/src/api/goal.ts` → `frontend/src/stores/goalStore.ts` → `frontend/src/pages/Goals.tsx`
- CarbonFactor：`database/init.sql`（基础结构）→ `backend/src/migrations/002_factor_versions.ts`（启动迁移补齐版本结构）→ `backend/src/models/carbonFactor.ts` → `backend/src/services/factorService.ts` → `backend/src/controllers/factorController.ts` → `backend/src/routes/factors.ts` → `frontend/src/api/factor.ts` → `frontend/src/constants/factor.ts` → `frontend/src/pages/Factors.tsx`

## 因子版本与生效期（固化口径）

- `carbon_factors` 在原有地区/分类/子类型基础上新增 `version`、`effective_date`、`status(active|inactive)`。
- 生效区间为**左闭右开** `[effective_date, 下一版本 effective_date)`；数据库唯一约束
  `uk_factor_version(region, category, sub_type, effective_date)` 把时间轴切成互不重叠的区间，
  因此同一地区/分类/子类型在任一日期只有一个版本；并发发布同一日期时第二条触发唯一键冲突，返回 `409 FACTOR_VERSION_CONFLICT`，只成功一次。
- 管理员接口（`requireRole=admin`，均写审计日志）：
  - `POST /factors`：发布新版本，`effective_date` 只能是今天或未来；版本号在该因子内 `max(version)+1`。
  - `PATCH /factors/:id`：修正**尚未生效**版本的因子值/单位/生效日期；已生效版本返回 `409 FACTOR_VERSION_EFFECTIVE` 锁定；已被活动固化的版本返回 `409 FACTOR_VERSION_REFERENCED`。
  - `PATCH /factors/:id/status`：停用 / 重新启用版本。
- `activities` 新增固化列 `factor_version`、`factor_value_snapshot`、`factor_effective_date`。
  新增或修改活动时，后端按 `record_date` 用 `effective_date <= record_date` 取最近的启用版本计算 `carbon_value` 并写入快照；
  之后发布新版本或停用旧版本都**不会回写**旧活动。仪表盘、目标进度、排行榜始终汇总活动的固化 `carbon_value`。
- 停用版本只影响之后的“按日期匹配”，不删除版本、不影响已引用活动。

## 数据库升级（新库 / 旧库同一套流程）

- 结构升级**不依赖** `docker-entrypoint-initdb.d`（那里的 `init.sql` 只在数据卷为空时执行一次，已有数据卷会跳过，无法升级旧库）。
- 升级统一由**后端启动迁移**完成：`main.ts` 在建立连接后、监听端口前运行 `backend/src/migrations/runner.ts`。
  - `schema_migrations` 表记录已应用版本；已应用的版本直接跳过，重复升级不会重复建结构或丢数据。
  - 每条 DDL 前先查 `information_schema` 判断列/索引是否存在，因此同一套步骤对**全新库和旧库都幂等**：新库由 `init.sql` 建基础表，002 再补 `version/effective_date/status/created_at`、唯一约束和活动快照列；旧库则补齐缺失的同名对象。
  - 002 会把存量因子回填为自 `2000-01-01` 起生效的 `v1`，并按 `factor_id` 回填历史活动的 `factor_version/factor_value_snapshot/factor_effective_date`；已固化的行不覆盖。
  - 加唯一约束前先检测存量重复数据，发现冲突直接报错并中止，保留原数据。
- **失败即停**：迁移或数据库连接失败时进程 `exit(1)`，不监听端口、不会带着缺字段的库继续对外服务；所有变更均为 additive，修正数据后重启即可续跑（已完成的步骤会跳过）。
- **多实例并发安全**：同一数据源同时启动多个实例时，`MigrationRunner` 用按库名命名的 MySQL 咨询锁（`GET_LOCK`）把结构变更串行化——只有一个实例（leader）执行 DDL，其余实例（waiter）在锁上等待；拿到锁后复查 `schema_migrations`，已登记则直接复用结果，不重复建列/建索引。leader 失败时不登记版本并释放锁，waiter 随后在同一临界区自行重跑幂等步骤，因此**成功则所有实例一起就绪，失败则所有实例都得到明确失败并拒绝服务**；修复数据后并发重启，所有实例都能成功。等待超时由 `MIGRATION_LOCK_TIMEOUT`（默认 120 秒）控制。
- 升级完成后，原有因子、活动、目标、排行榜与角色权限保持不变。

## 横切关注点

- 认证授权（JWT + RBAC）：`database/init.sql` 的 `roles`、`user_roles`，`backend/src/middlewares/auth.ts`，`backend/src/middlewares/roleCheck.ts`，`backend/src/utils/jwt.ts`，`backend/src/routes/*.ts`，`frontend/src/router/guards.ts`，`frontend/src/stores/authStore.ts`，`frontend/src/components/common/PermissionButton.tsx`，`frontend/src/types/auth.ts`
- 操作日志：`database/init.sql` 的 `audit_logs`，`backend/src/middlewares/auditLogger.ts`，`backend/src/services/auditLogService.ts`，`backend/src/models/auditLog.ts`，写操作路由审计拦截，`frontend/src/api/audit.ts`，`frontend/src/pages/AuditLog.tsx`
- 全局错误处理：`backend/src/middlewares/errorHandler.ts`，`backend/src/utils/AppError.ts`，`backend/src/constants/errorCodes.ts`，`frontend/src/utils/request.ts`，`frontend/src/components/common/GlobalErrorBoundary.tsx`

## 枚举出现位置清单

### ActivityCategory

- 后端定义：`backend/src/constants/activity.ts`
- 后端引用：`backend/src/constants/errorCodes.ts`、`backend/src/constants/logTemplates.ts`、`backend/src/models/activity.ts`、`backend/src/models/carbonFactor.ts`、`backend/src/services/activityService.ts`、`backend/src/services/factorService.ts`、`backend/src/routes/activities.ts`、`backend/src/routes/factors.ts`
- 前端定义：`frontend/src/constants/activity.ts`
- 前端引用：`frontend/src/constants/errorCodes.ts`、`frontend/src/constants/messages.ts`、`frontend/src/types/entities.ts`、`frontend/src/api/activity.ts`、`frontend/src/api/factor.ts`、`frontend/src/stores/activityStore.ts`、`frontend/src/components/common/CategoryBadge.tsx`、`frontend/src/components/common/ActivityCard.tsx`、`frontend/src/components/common/CarbonTrendChart.tsx`、`frontend/src/pages/Activities.tsx`、`frontend/src/pages/Ranking.tsx`、`frontend/src/utils/carbonCalculator.ts`、`frontend/src/utils/formatters.ts`

### GoalStatus

- 后端定义：`backend/src/constants/goal.ts`
- 后端引用：`backend/src/constants/errorCodes.ts`、`backend/src/constants/logTemplates.ts`、`backend/src/models/goal.ts`、`backend/src/services/goalService.ts`、`backend/src/routes/goals.ts`
- 前端定义：`frontend/src/constants/goal.ts`
- 前端引用：`frontend/src/constants/errorCodes.ts`、`frontend/src/constants/messages.ts`、`frontend/src/types/entities.ts`、`frontend/src/api/goal.ts`、`frontend/src/components/common/GoalProgressCard.tsx`、`frontend/src/pages/Goals.tsx`、`frontend/src/utils/formatters.ts`

## 强制分层与耦合设计

项目刻意保持“严禁合并职责到单一文件”：实体、服务、控制器、路由、API、store、页面拆分到独立文件。日志模块由 `backend/src/utils/logger.ts` 单独管理，但 controller、service、middleware 均引用它；日志模板集中在 `backend/src/constants/logTemplates.ts`，包含 20 条以上模板。错误码集中在 `backend/src/constants/errorCodes.ts`，但 service/controller 仍手动拼接包含实体名和字段名的错误 message。前端 `frontend/src/utils/formatters.ts` 同时包含日期、金额、碳排放、状态文本映射，`frontend/src/constants/messages.ts` 和后端 `backend/src/constants/messages.ts` 刻意保存耦合文案。

如果后续给 Activity 新增 `waste` 分类，至少需要修改：数据库初始化或 migration、Activity 实体、CarbonFactor 实体、前后端 `constants/activity.ts`、错误码、日志模板、formatters、ActivityCard、筛选器、Dashboard 图表分类等 8 个以上文件。

## License

MIT
