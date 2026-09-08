# ПожНадзор.pro — Информационная система ГПН МЧС России

Комплексная автоматизированная система для органов Государственного пожарного надзора МЧС России.

## 🚀 Быстрый запуск в Docker:

```bash
docker compose up --build -d
```

После запуска сервисы доступны:
- 🌐 **Фронтенд:** http://localhost:3000
- ⚙️ **API Swagger Документация:** http://localhost:8000/docs
- 🗄️ **PostgreSQL:** порт 5432 (пользователь: postgres, пароль: postgres, БД: pozhnadzor)

---

## 🛡️ Резервное копирование (Backups) в Docker

В `docker-compose.yml` встроен выделенный изолированный сервис **`db-backup`** на базе `postgres:16-alpine`, который автоматически создает сжатые дампы базы данных PostgreSQL и производит ротацию устаревших копий.

### 📁 Хранение бэкапов:
Все файлы сохраняются на хосте в каталоге:
```bash
./backups/pozhnadzor_backup_YYYY-MM-DD_HH-MM-SS.sql.gz
```
(директория добавлена в `.gitignore`, ваши данные не попадут в Git-репозиторий).

### ⚙️ Настройки сервиса в `docker-compose.yml`:
| Переменная | По умолчанию | Описание |
|---|---|---|
| `CRON_SCHEDULE` | `0 3 * * *` | Расписание Cron (по умолчанию каждый день в 03:00 ночи) |
| `BACKUP_KEEP_DAYS` | `7` | Срок хранения бэкапов в днях (старые удаляются автоматически) |
| `BACKUP_ON_START` | `true` | Создавать снимок БД сразу при первом запуске контейнера |
| `TZ` | `Europe/Moscow` | Часовой пояс сервера |

---

### 📦 Команды управления бэкапами на сервере:

#### 1. Создать бэкап прямо сейчас:
```bash
./scripts/backup-now.sh
```
*Или напрямую через docker compose:*
```bash
docker compose exec db-backup /scripts/backup.sh
```

#### 2. Посмотреть сохраненные копии:
```bash
ls -lh ./backups/
```

#### 3. Восстановить базу данных из бэкапа:
- Восстановить **самый свежий** дамп:
```bash
./scripts/restore-db.sh
```
- Восстановить **конкретный** файл дампа:
```bash
./scripts/restore-db.sh ./backups/pozhnadzor_backup_2026-09-08_03-00-00.sql.gz
```
*Или напрямую через docker compose:*
```bash
docker compose exec db-backup /scripts/restore.sh /backups/имя_файла.sql.gz
```

#### 4. Посмотреть логи сервиса бэкапов:
```bash
docker compose logs -f db-backup
```
