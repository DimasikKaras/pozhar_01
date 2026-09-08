#!/usr/bin/env bash
# ==============================================================================
# Скрипт восстановления базы данных ПожНадзор.pro из резервной копии через Docker
# Использование:
#   ./scripts/restore-db.sh                                      # Восстановит самый свежий бэкап
#   ./scripts/restore-db.sh backups/pozhnadzor_backup_...sql.gz  # Восстановит указанный файл
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIR}"

FILE="$1"

if [ -n "$FILE" ]; then
  BASENAME=$(basename "$FILE")
  TARGET_PATH="/backups/${BASENAME}"
  echo "🔄 Запуск восстановления из указанного файла: ${FILE}"
else
  TARGET_PATH=""
  echo "🔄 Запуск восстановления из последнего доступного бэкапа..."
fi

read -p "⚠️ ВНИМАНИЕ: Текущие данные в базе будут перезаписаны. Продолжить? (y/N): " CONFIRM
if [[ "$CONFIRM" != [yY] && "$CONFIRM" != [yY][eE][sS] ]]; then
  echo "Отмена операции восстановления."
  exit 0
fi

if docker compose ps --services --filter "status=running" | grep -q "db-backup"; then
  docker compose exec db-backup /scripts/restore.sh "${TARGET_PATH}"
else
  docker compose run --rm db-backup /scripts/restore.sh "${TARGET_PATH}"
fi

echo "✅ База данных успешно восстановлена!"
