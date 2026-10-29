#!/usr/bin/env bash
# microkernel-admin 发布：构建镜像 → 校验编排 → 起容器 → 健康检查。
# 幂等：重复执行只替换镜像并重建容器，数据目录不动。
set -euo pipefail

DEPLOY_DIR="$(cd -- "$(dirname -- "$(readlink -f -- "${BASH_SOURCE[0]}")")" && pwd -P)"
PROJECT_DIR="$(cd -- "${DEPLOY_DIR}/.." && pwd -P)"
ENV_FILE="${DEPLOY_DIR}/.env"

[[ -f "$ENV_FILE" ]] || { echo "缺少 ${ENV_FILE}（可从 .env.example 复制）" >&2; exit 1; }
set -a; # shellcheck disable=SC1090
source "$ENV_FILE"; set +a

: "${MICRO_ADMIN_IMAGE:?MICRO_ADMIN_IMAGE is required}"
: "${MICRO_ADMIN_HOST_PORT:?MICRO_ADMIN_HOST_PORT is required}"
: "${MICRO_ADMIN_DATA_DIR:?MICRO_ADMIN_DATA_DIR is required}"

mkdir -p "$MICRO_ADMIN_DATA_DIR"

echo "[1/4] 构建镜像 $MICRO_ADMIN_IMAGE"
docker build -t "$MICRO_ADMIN_IMAGE" "$PROJECT_DIR"

echo "[2/4] 校验编排（docker compose config）"
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" --env-file "$ENV_FILE" config >/dev/null

echo "[3/4] 起容器"
docker compose -f "${DEPLOY_DIR}/docker-compose.yml" --env-file "$ENV_FILE" up -d

echo "[4/4] 健康检查"
for _ in $(seq 1 40); do
    if curl -fsS "http://127.0.0.1:${MICRO_ADMIN_HOST_PORT}/api/health" >/dev/null 2>&1; then
        echo "健康：http://127.0.0.1:${MICRO_ADMIN_HOST_PORT}/api/health → $(curl -s "http://127.0.0.1:${MICRO_ADMIN_HOST_PORT}/api/health")"
        exit 0
    fi
    sleep 1
done
echo "健康检查失败，最近日志：" >&2
docker logs --tail 40 micro-admin >&2 || true
exit 1
