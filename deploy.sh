#!/usr/bin/env bash
# Pull-based deploy: serverga faqat docker-compose.prod.yml boradi,
# image'lar Docker Hub'dan tortiladi (GitHub Actions build qilib qo'yadi).
#
#   ./deploy.sh          # compose faylni yuboradi, pull + up -d
#   ./deploy.sh --logs   # deploydan so'ng loglarni kuzatadi
#
# Talab: ~/.ssh/config da SSH_ALIAS uchun alias (HOME-SERVER.md ga qarang).
# Yangi kod chiqarish tartibi: git push (main) → Actions image'larni push qiladi → ./deploy.sh

set -euo pipefail

# ===== SOZLAMALAR =====
PROJECT="server-snapshot"   # serverdagi papka nomi → ~/server-snapshot
SSH_ALIAS="homeserver"      # ~/.ssh/config dagi alias
DASHBOARD_PORT="8001"       # HOME-SERVER.md portlar reestriga qarang
LOG_SERVICE="frontend"      # loglar uchun asosiy servis
# ======================

REMOTE_DIR="~/$PROJECT"
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

FOLLOW_LOGS=false
for arg in "$@"; do
  case "$arg" in
    --logs) FOLLOW_LOGS=true ;;
    *) echo "Noma'lum bayroq: $arg" >&2; exit 1 ;;
  esac
done

echo "==> 1/3  Compose fayl yuborilmoqda ($SSH_ALIAS:$REMOTE_DIR)..."
ssh "$SSH_ALIAS" "mkdir -p $REMOTE_DIR"
scp -q "$LOCAL_DIR/docker-compose.prod.yml" "$SSH_ALIAS:$REMOTE_DIR/docker-compose.yml"
ssh "$SSH_ALIAS" "grep -qs '^DASHBOARD_PORT=' $REMOTE_DIR/.env 2>/dev/null || echo 'DASHBOARD_PORT=$DASHBOARD_PORT' >> $REMOTE_DIR/.env"

echo "==> 2/3  Image'lar tortilmoqda + ishga tushirish..."
ssh "$SSH_ALIAS" "cd $REMOTE_DIR && docker compose pull && docker compose up -d"

echo "==> 3/3  Holat:"
ssh "$SSH_ALIAS" "cd $REMOTE_DIR && docker compose ps --format 'table {{.Service}}\t{{.Status}}'"
echo "✅ Deploy tugadi: dashboard $DASHBOARD_PORT-portда"

if $FOLLOW_LOGS; then
  ssh -t "$SSH_ALIAS" "cd $REMOTE_DIR && docker compose logs -f $LOG_SERVICE"
fi
