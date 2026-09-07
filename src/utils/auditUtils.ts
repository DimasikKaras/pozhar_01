import { AuditLogEntry, AuditActionType, Inspector } from '../types';

const AUDIT_STORAGE_KEY = 'pozhnadzor_audit_logs_v1';

const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 1,
    user_name: 'Быков Дмитрий Алексеевич',
    user_role: 'Администратор',
    action: 'Вход в систему',
    target: 'Служебный портал ГПН',
    details: 'Успешная аутентификация с подтверждением 2FA (TOTP RFC 6238)',
    timestamp: '2026-09-04 10:15:32',
  },
  {
    id: 2,
    user_name: 'Быков Дмитрий Алексеевич',
    user_role: 'Администратор',
    action: 'Добавление объекта',
    target: 'ТРЦ «Галерея Новосибирск»',
    details: 'Категория риска: Высокий, ул. Гоголя, д. 13',
    timestamp: '2026-09-04 10:18:04',
  },
  {
    id: 3,
    user_name: 'Иванов Иван Иванович',
    user_role: 'Старший инспектор',
    action: 'Проведение проверки',
    target: 'МКОУ «СОШ № 8 г. Черемхово»',
    details: 'Результат: Пройдена. Выдано предписание № 44/2026',
    timestamp: '2026-09-04 10:20:19',
  },
  {
    id: 4,
    user_name: 'Быков Дмитрий Алексеевич',
    user_role: 'Администратор',
    action: 'Добавление оборудования',
    target: 'Огнетушитель ОП-5 (серийный #421)',
    details: 'Объект: ТРЦ «Аура», статус: Исправен',
    timestamp: '2026-09-04 10:22:45',
  },
  {
    id: 5,
    user_name: 'Быков Дмитрий Алексеевич',
    user_role: 'Администратор',
    action: 'Изменение объекта',
    target: '1 корпус НГТУ (Главный)',
    details: 'Обновлено ответственное лицо: Смирнов А.В.',
    timestamp: '2026-09-04 10:25:12',
  },
];

export const loadAuditLogs = (): AuditLogEntry[] => {
  try {
    const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load audit logs from localStorage:', e);
  }
  return INITIAL_AUDIT_LOGS;
};

export const saveAuditLogs = (logs: AuditLogEntry[]): void => {
  try {
    localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Failed to save audit logs to localStorage:', e);
  }
};

export const formatCurrentTimestamp = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export const createAuditEntry = (
  user: Inspector | null | undefined,
  action: AuditActionType,
  target: string,
  details?: string
): AuditLogEntry => {
  const currentLogs = loadAuditLogs();
  const nextId = currentLogs.length > 0 ? Math.max(...currentLogs.map((l) => l.id)) + 1 : 1;

  const newEntry: AuditLogEntry = {
    id: nextId,
    user_name: user?.full_name || 'Системный процесс',
    user_role: user?.role || 'Система',
    action,
    target,
    details: details || '',
    timestamp: formatCurrentTimestamp(),
  };

  const updated = [newEntry, ...currentLogs];
  saveAuditLogs(updated);

  window.dispatchEvent(new CustomEvent('audit:new-entry', { detail: newEntry }));

  return newEntry;
};
