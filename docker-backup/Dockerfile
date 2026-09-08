FROM postgres:16-alpine

# Устанавливаем необходимые утилиты
RUN apk add --no-cache bash gzip tzdata

# Создаем рабочие каталоги
WORKDIR /scripts
RUN mkdir -p /backups /scripts

# Копируем скрипты
COPY backup.sh /scripts/backup.sh
COPY restore.sh /scripts/restore.sh
COPY entrypoint.sh /scripts/entrypoint.sh

RUN chmod +x /scripts/*.sh

VOLUME ["/backups"]

ENTRYPOINT ["/scripts/entrypoint.sh"]
CMD ["cron"]
