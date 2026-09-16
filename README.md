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
- CarbonFactor 按地区与分类匹配并自动计算 `carbon_value`
- 仪表盘展示今日、本周、本月碳排放和趋势图
- 目标管理展示目标完成进度和到期区间
- 排行榜按地区和时间段查看用户低碳排名
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
│   └── init.sql
├── backend/
│   ├── Dockerfile
│   └── src/
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
- CarbonFactor：`database/init.sql` → `backend/src/models/carbonFactor.ts` → `backend/src/services/factorService.ts` → `backend/src/controllers/factorController.ts` → `backend/src/routes/factors.ts` → `frontend/src/api/factor.ts` → `frontend/src/pages/Activities.tsx`

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
