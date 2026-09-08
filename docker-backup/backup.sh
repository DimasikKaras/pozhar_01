#!/usr/bin/env bash
set -e

# Конфигурация параметров подключения
POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-pozhnadzor}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILENAME="${POSTGRES_DB}_backup_${TIMESTAMP}.sql.gz"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"

echo "=================================================="
echo "📦 [$(date +'%Y-%m-%d %H:%M:%S')] Запуск создания бэкапа базы: ${POSTGRES_DB}"
echo "Хост: ${POSTGRES_HOST}:${POSTGRES_PORT}, Пользователь: ${POSTGRES_USER}"

# Ожидание готовности PostgreSQL
echo "⏳ Проверка доступности PostgreSQL..."
export PGPASSWORD="${POSTGRES_PASSWORD}"
until pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > /dev/null 2>&1; do
  echo "⚠️ База данных пока недоступна, повтор через 2 сек..."
  sleep 2
done

mkdir -p "${BACKUP_DIR}"

echo "🚀 Создание дампа PostgreSQL и сжатие в gzip..."
# --clean: добавляет DROP TABLE IF EXISTS перед созданием
# --if-exists: не падает, если таблиц еще нет
# --no-owner: не привязывает к локальным системным ролям
pg_dump \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_USER}" \
  -d "${POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  | gzip -9 > "${BACKUP_PATH}"

# Проверяем размер файла
FILESIZE=$(ls -lh "${BACKUP_PATH}" | awk '{print $5}')
echo "✅ Бэкап успешно создан: ${BACKUP_FILENAME} (Размер: ${FILESIZE})"

# Ротация старых бэкапов
if [ "${BACKUP_KEEP_DAYS}" -gt 0 ]; then
  echo "🧹 Удаление бэкапов старше ${BACKUP_KEEP_DAYS} дн. из каталога ${BACKUP_DIR}..."
  DELETED_COUNT=$(find "${BACKUP_DIR}" -name "${POSTGRES_DB}_backup_*.sql.gz" -type f -mtime +"${BACKUP_KEEP_DAYS}" | wc -l)
  find "${BACKUP_DIR}" -name "${POSTGRES_DB}_backup_*.sql.gz" -type f -mtime +"${BACKUP_KEEP_DAYS}" -delete
  echo "🗑️ Удалено устаревших копий: ${DELETED_COUNT}"
fi

TOTAL_BACKUPS=$(ls -1 "${BACKUP_DIR}"/${POSTGRES_DB}_backup_*.sql.gz 2>/dev/null | wc -l)
echo "📊 Всего сохранено бэкапов в хранилище: ${TOTAL_BACKUPS}"
echo "=================================================="
