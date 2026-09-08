#!/usr/bin/env bash
set -e

# Поддержка разовых команд через docker compose run / exec
if [ "$1" = "backup" ] || [ "$1" = "now" ]; then
  exec /scripts/backup.sh
elif [ "$1" = "restore" ]; then
  shift
  exec /scripts/restore.sh "$@"
fi

# Режим фонового планировщика по Cron
CRON_SCHEDULE="${CRON_SCHEDULE:-0 3 * * *}"
TZ="${TZ:-Europe/Moscow}"

echo "=================================================="
echo "🛡️ Служба автоматического резервного копирования БД ПожНадзор"
echo "⏰ Расписание Cron: ${CRON_SCHEDULE} (Часовой пояс: ${TZ})"
echo "📁 Каталог бэкапов: ${BACKUP_DIR:-/backups}"
echo "🗓️ Срок хранения: ${BACKUP_KEEP_DAYS:-7} дней"
echo "=================================================="

# Первый проверочный бэкап при старте контейнера (по умолчанию включен)
if [ "${BACKUP_ON_START:-true}" = "true" ]; then
  echo "🚀 Выполняется начальный бэкап при старте сервиса..."
  /scripts/backup.sh || echo "⚠️ Начальный бэкап завершился с предупреждением"
fi

# Настройка системного cron в Alpine
CRON_FILE="/etc/crontabs/root"
echo "${CRON_SCHEDULE} /scripts/backup.sh >> /var/log/cron_backup.log 2>&1" > "${CRON_FILE}"

echo "🟢 Планировщик crond запущен и ожидает наступления времени бэкапа..."
# Запускаем crond на переднем плане (-f), уровень логов (-l 2)
exec crond -f -l 2
