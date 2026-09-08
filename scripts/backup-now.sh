#!/usr/bin/env bash
# ==============================================================================
# Скрипт мгновенного создания резервной копии базы данных ПожНадзор.pro через Docker
# Использование: ./scripts/backup-now.sh
# ==============================================================================
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${DIR}"

echo "📦 Инициация создания бэкапа PostgreSQL через Docker..."

# Проверяем, запущен ли контейнер db-backup
if docker compose ps --services --filter "status=running" | grep -q "db-backup"; then
  echo "⚡ Вызов резервного копирования в работающем сервисе 'db-backup'..."
  docker compose exec db-backup /scripts/backup.sh
elif docker compose ps --services --filter "status=running" | grep -q "db"; then
  echo "🚀 Запуск временного контейнера для снятия дампа..."
  docker compose run --rm db-backup /scripts/backup.sh
else
  echo "❌ Ошибка: Сервисы Docker не запущены!"
  echo "Запустите проект командой: docker compose up -d"
  exit 1
fi

echo ""
echo "✅ Бэкап завершен. Список свежих файлов в директории ./backups:"
ls -lh ./backups/*.sql.gz 2>/dev/null || echo "Файлы сохранены в volume backups"
