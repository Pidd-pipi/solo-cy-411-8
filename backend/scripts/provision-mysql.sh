#!/usr/bin/env bash
# 回归测试用“真实持久化 MySQL/MariaDB”供给。
#
# 用法：
#   ./scripts/provision-mysql.sh up     # 启动一个干净的真实数据库（默认 docker mysql:8.0）
#   ./scripts/provision-mysql.sh down   # 停止并删除
#
# 三种供给方式（按优先级）：
#   1) 已通过 MYSQL_TEST_HOST/PORT 提供外部实例：脚本只做 ping，不重复起服务。
#   2) 本机有 docker：起一个一次性 mysql:8.0 容器（数据仅用于回归，可重复重建）。
#   3) 无 docker / 无 root（如 CI 沙箱）：用用户态 mariadb 二进制在 TCP 端口起服务。
#
# 回归测试（npm run test:regression）只认真实数据库连接，不接受内存替身。
set -euo pipefail

CONTAINER_NAME="${CT_MYSQL_CONTAINER:-carbontrack-regtest-mysql}"
PORT="${MYSQL_TEST_PORT:-3399}"
HOST="${MYSQL_TEST_HOST:-127.0.0.1}"
ADMIN_USER="${MYSQL_TEST_USER:-ct}"
ADMIN_PASS="${MYSQL_TEST_PASS:-ctpw}"

have() { command -v "$1" >/dev/null 2>&1; }

wait_tcp() {
  local host="$1" port="$2" tries="${3:-60}" i
  for ((i=0; i<tries; i++)); do
    if (exec 3<>"/dev/tcp/${host}/${port}") 2>/dev/null; then exec 3>&- 3<&-; return 0; fi
    sleep 1
  done
  return 1
}

ping_sql() {
  # 用后端自带的 mysql2 做一次真实登录探测，避免依赖本机 mysql CLI。
  node - "$HOST" "$PORT" "$ADMIN_USER" "$ADMIN_PASS" <<'NODE'
const mysql = require('mysql2/promise');
const [, , host, port, user, password] = process.argv;
(async () => {
  const conn = await mysql.createConnection({ host, port: Number(port), user, password, connectTimeout: 3000 });
  await conn.query('SELECT 1');
  await conn.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
NODE
}

up_external() {
  echo "[provision] using external MySQL at ${HOST}:${PORT}"
  ping_sql
  echo "[provision] external database ready"
}

up_docker() {
  echo "[provision] starting docker mysql:8.0 at 127.0.0.1:${PORT}"
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  docker run -d --name "$CONTAINER_NAME" \
    -e MYSQL_ROOT_PASSWORD=rootpw \
    -e MYSQL_DATABASE=carbontrack_regtest \
    -e MYSQL_USER="$ADMIN_USER" -e MYSQL_PASSWORD="$ADMIN_PASS" \
    -p "${PORT}:3306" mysql:8.0 \
    --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci >/dev/null
  wait_tcp 127.0.0.1 "$PORT"
  # 给应用账号授予建/删库权限（回归需要为不同套件重建独立库）。
  docker exec "$CONTAINER_NAME" sh -c \
    "mysql -uroot -prootpw -e \"GRANT ALL PRIVILEGES ON *.* TO '${ADMIN_USER}'@'%'; FLUSH PRIVILEGES;\"" 2>/dev/null || true
  until ping_sql >/dev/null 2>&1; do sleep 1; done
  echo "[provision] docker mysql ready"
}

up_local_mariadb() {
  # 用户态 MariaDB（无 root、无 docker 的沙箱回退）。需要先准备二进制前缀，见脚本顶部注释仓库外流程。
  local PREFIX="${CT_MARIADB_PREFIX:-/tmp/mct-mariadb}"
  local DATADIR="${CT_MARIADB_DATADIR:-/tmp/mct-data}"
  local RUNDIR=/tmp/mct-run
  [ -x "$PREFIX/usr/sbin/mariadbd" ] || { echo "[provision] local mariadb not found at $PREFIX" >&2; return 1; }
  export LD_LIBRARY_PATH="$PREFIX/usr/lib/aarch64-linux-gnu:$PREFIX/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
  mkdir -p "$RUNDIR"
  if ping_sql >/dev/null 2>&1; then echo "[provision] local mariadb already running at ${HOST}:${PORT}"; return 0; fi
  if [ ! -d "$DATADIR/mysql" ]; then
    "$PREFIX/usr/bin/mariadb-install-db" --basedir="$PREFIX/usr" --datadir="$DATADIR" \
      --auth-root-authentication-method=normal --skip-test-db >/dev/null
  fi
  nohup "$PREFIX/usr/sbin/mariadbd" --no-defaults --basedir="$PREFIX/usr" --datadir="$DATADIR" \
    --socket="$RUNDIR/mysql.sock" --port="$PORT" --bind-address=127.0.0.1 \
    --pid-file="$RUNDIR/mariadbd.pid" --console >"$RUNDIR/mariadbd.log" 2>&1 &
  wait_tcp 127.0.0.1 "$PORT"
  "$PREFIX/usr/bin/mariadb" --protocol=socket -uroot -S"$RUNDIR/mysql.sock" -e \
    "CREATE DATABASE IF NOT EXISTS carbontrack_regtest CHARACTER SET utf8mb4;
     CREATE USER IF NOT EXISTS '${ADMIN_USER}'@'%' IDENTIFIED BY '${ADMIN_PASS}';
     CREATE USER IF NOT EXISTS '${ADMIN_USER}'@'localhost' IDENTIFIED BY '${ADMIN_PASS}';
     GRANT ALL PRIVILEGES ON *.* TO '${ADMIN_USER}'@'%';
     GRANT ALL PRIVILEGES ON *.* TO '${ADMIN_USER}'@'localhost';
     FLUSH PRIVILEGES;"
  until ping_sql >/dev/null 2>&1; do sleep 1; done
  echo "[provision] local mariadb ready at 127.0.0.1:${PORT}"
}

down_all() {
  if have docker && docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER_NAME"; then
    docker rm -f "$CONTAINER_NAME" >/dev/null && echo "[provision] removed docker container"
  fi
  if [ -f /tmp/mct-run/mariadbd.pid ]; then
    kill "$(cat /tmp/mct-run/mariadbd.pid)" 2>/dev/null || true
    echo "[provision] stopped local mariadb"
  fi
}

case "${1:-up}" in
  up)
    if [ "${MYSQL_TEST_EXTERNAL:-0}" = "1" ]; then up_external
    elif have docker; then up_docker
    else up_local_mariadb; fi
    ;;
  down) down_all ;;
  *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
