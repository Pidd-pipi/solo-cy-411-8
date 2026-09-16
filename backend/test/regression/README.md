# 因子版本回归测试（真实持久化环境）

这组测试**只使用真实环境**：真实 MySQL/MariaDB 数据库 + 真实的后端进程（`spawn dist/main.js`）+ 真实 HTTP 请求，
**不使用内存替身、不 mock、不跳过真实写入**。每个套件都使用独立 database，可重复运行。

## 覆盖内容

`migrations.test.js`（迁移链路）
- 空库初始化：导入 `database/init.sql` 后启动，002 自动补齐版本结构/约束/活动快照；**重复启动不重复建结构、不丢数据**。
- 全新库但基础表尚未建好（模拟 docker entrypoint 与后端竞争）：服务等待，`init.sql` 出现后迁移成功才对外服务。
- 旧库升级：`fixtures/legacy-v1.sql`（无版本列的线上 v1 结构）直接换新后端启动，补齐结构与快照；
  原有因子、活动、目标、审计、用户/角色权限保持不变；再次启动幂等。
- 存量重复数据时迁移**阻断启动（进程非零退出、不监听端口）且保留原数据**；运维修复后重跑可继续成功。

`factor-versions.test.js`（版本业务，全部走真实 HTTP）
- 同一地区/分类/子类型同一生效日期重叠发布返回 `409 FACTOR_VERSION_CONFLICT`；不同日期可继续且版本号递增。
- 并发发布同一日期：恰有一次成功、另一次 409，真实库里只有一条。
- 按“活动日期”取当时生效因子：今天活动按 v1 计算固化，未来日期活动按 v2 计算并固化对应 `factor_id/version/快照`。
- 后续再发布新版本、停用旧版本，都**不改变旧活动的 `carbon_value` 与快照**；仪表盘依赖的排行榜、目标进度继续用固化值。
- 停用期间该日期无法匹配因子时新建活动返回 `404`；重新启用后恢复。
- 权限：无令牌 401、普通成员发布/停用 403、成员可只读。
- 非法日期（过去日期、坏格式）400；已生效版本修正 409、被活动固化的未生效版本修正 409；不存在版本 404；非法状态 400。
- 重启同一持久库后结构、固化结果、迁移登记保持一致。

## 准备真实数据库

脚本 `scripts/provision-mysql.sh` 支持三种供给（按优先级）：

1. 外部实例：设置 `MYSQL_TEST_EXTERNAL=1` 及 `MYSQL_TEST_HOST/PORT/USER/PASS`，脚本只做登录探测。
2. 本机有 Docker：自动起一次性 `mysql:8.0`（映射到 `MYSQL_TEST_PORT`，默认 3399）。
3. 无 Docker / 无 root：回退到用户态 MariaDB 二进制（`CT_MARIADB_PREFIX`，默认 `/tmp/mct-mariadb`）。

```bash
npm run provision:mysql      # 启动/探测真实数据库
npm run teardown:mysql       # 停止并清理（docker 容器或本地进程）
```

## 运行

```bash
# 1. 先构建后端并准备数据库
npm run build
npm run provision:mysql

# 2. 跑全部回归（串行执行，避免端口竞争）
node --test --test-concurrency=1 test/regression/

# 或一键（会先 build；数据库需已就绪）
npm run test:regression
```

可用环境变量：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `MYSQL_TEST_HOST` | `127.0.0.1` | 真实数据库地址 |
| `MYSQL_TEST_PORT` | `3399` | 真实数据库端口 |
| `MYSQL_TEST_USER` | `ct` | 账号（需有建/删库权限） |
| `MYSQL_TEST_PASS` | `ctpw` | 密码 |
| `MYSQL_TEST_EXTERNAL` | `0` | 置 `1` 表示使用外部实例，供给脚本不再自起服务 |
| `LOG_LEVEL` | `error` | 降低后端子进程日志噪音 |

测试会反复 `DROP/CREATE` 以下独立库：`ct_fresh`、`ct_empty_then_init`、`ct_legacy`、`ct_legacy_dup`、`ct_biz`，
因此请使用专用的一次性数据库实例，不要指向生产库。
