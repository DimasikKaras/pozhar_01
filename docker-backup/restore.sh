#!/usr/bin/env bash
set -e

POSTGRES_HOST="${POSTGRES_HOST:-db}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-pozhnadzor}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"

RESTORE_FILE="$1"

if [ -z "${RESTORE_FILE}" ]; then
  # Ищем самый свежий бэкап
  LATEST_BACKUP=$(ls -t "${BACKUP_DIR}"/${POSTGRES_DB}_backup_*.sql.gz 2>/dev/null | head -n 1)
  if [ -z "${LATEST_BACKUP}" ]; then
    echo "❌ Ошибка: В директории ${BACKUP_DIR} не найдено ни одного файла бэкапа для базы '${POSTGRES_DB}'!"
    echo "Укажите путь к файлу явно: /scripts/restore.sh /backups/имя_файла.sql.gz"
    exit 1
  fi
  RESTORE_FILE="${LATEST_BACKUP}"
  echo "ℹ️ Файл бэкапа не указан. Выбран самый последний: ${RESTORE_FILE}"
else
  # Если передан относительный путь или просто имя файла
  if [ ! -f "${RESTORE_FILE}" ] && [ -f "${BACKUP_DIR}/${RESTORE_FILE}" ]; then
    RESTORE_FILE="${BACKUP_DIR}/${RESTORE_FILE}"
  fi
fi

if [ ! -f "${RESTORE_FILE}" ]; then
  echo "❌ Ошибка: Файл бэкапа не найден: ${RESTORE_FILE}"
  exit 1
fi

echo "=================================================="
echo "⚠️ [$(date +'%Y-%m-%d %H:%M:%S')] ВОССТАНОВЛЕНИЕ БАЗЫ ДАННЫХ: ${POSTGRES_DB}"
echo "Источник: ${RESTORE_FILE}"
echo "Целевой сервер: ${POSTGRES_HOST}:${POSTGRES_PORT} (пользователь: ${POSTGRES_USER})"
echo "=================================================="

export PGPASSWORD="${POSTGRES_PASSWORD}"
until pg_isready -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" > /dev/null 2>&1; do
  echo "⏳ Ожидание базы данных..."
  sleep 2
done

echo "🔄 Применение SQL-дампа в базу '${POSTGRES_DB}'..."
if [[ "${RESTORE_FILE}" == *.gz ]]; then
  gunzip -c "${RESTORE_FILE}" | psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1
else
  psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v ON_ERROR_STOP=1 < "${RESTORE_FILE}"
fi

echo "✅ База данных '${POSTGRES_DB}' успешно восстановлена из ${RESTORE_FILE}!"
echo "=================================================="
