export type Role = 'Администратор' | 'Старший инспектор' | 'Инспектор';
export type RiskLevel = 'Высокий' | 'Значительный' | 'Средний' | 'Умеренный' | 'Низкий';
export type EquipmentStatus = 'Исправен' | 'Требует ремонта' | 'Списан' | 'На проверке';
export type InspectionResult = 'Пройдена' | 'Не пройдена';

export interface Inspector {
  id: number;
  full_name: string;
  rank: string;
  phone?: string;
  email: string;
  role: Role;
  login?: string;
  password?: string;
  password_hash?: string;
  two_factor_enabled?: boolean;
  two_factor_method?: 'totp' | 'email';
  two_factor_secret?: string;
  backup_codes?: string[];
}

export interface UserCredential {
  id: number;
  login: string;
  email: string;
  password_hash?: string;
  password?: string;
  full_name: string;
  rank: string;
  phone?: string;
  role: Role;
  two_factor_enabled?: boolean;
  two_factor_method?: string;
  two_factor_secret?: string;
  backup_codes?: string[];
  created_at?: string;
}

export interface Facility {
  id: number;
  name: string;
  address: string;
  risk_level: RiskLevel;
  cadastral_number?: string;
  responsible_person?: string;
}

export interface Equipment {
  id: number;
  facility_id: number;
  name?: string;
  type: string;
  serial_number?: string;
  status: EquipmentStatus;
  last_check_date: string;
  next_check_date?: string;
  notes?: string;
}

export interface Inspection {
  id: number;
  facility_id: number;
  inspector_id: number;
  date: string;
  result: InspectionResult;
  violations?: string;
  prescription_number?: string;
}

export type AuditActionType =
  | 'Вход в систему'
  | 'Выход из системы'
  | 'Добавление объекта'
  | 'Изменение объекта'
  | 'Удаление объекта'
  | 'Проведение проверки'
  | 'Удаление проверки'
  | 'Добавление оборудования'
  | 'Изменение оборудования'
  | 'Удаление оборудования'
  | 'Регистрация сотрудника'
  | 'Удаление сотрудника'
  | 'Экспорт отчета / Резервная копия'
  | 'Восстановление из бэкапа'
  | 'Очистка базы от дубликатов';

export interface AuditLogEntry {
  id: number;
  user_name: string;
  user_role: string;
  action: AuditActionType;
  target: string;
  details?: string;
  timestamp: string;
}

export interface BackupPayload {
  system?: string;
  version?: string;
  backup_date?: string;
  export_date?: string;
  environment?: string;
  checksum_algo?: string;
  records_summary?: {
    facilities_count?: number;
    inspections_count?: number;
    equipment_count?: number;
    inspectors_count?: number;
    users_count?: number;
    audit_logs_count?: number;
  };
  database?: {
    users?: UserCredential[];
    inspectors?: Inspector[];
    facilities?: Facility[];
    inspections?: Inspection[];
    equipment?: Equipment[];
    audit_logs?: AuditLogEntry[];
  };
  users?: UserCredential[];
  inspectors?: Inspector[];
  facilities?: Facility[];
  inspections?: Inspection[];
  equipment?: Equipment[];
  audit_logs?: AuditLogEntry[];
}

export const isUserAdmin = (user?: any): boolean => {
  if (!user) {
    try {
      const s =
        localStorage.getItem('current_user') ||
        localStorage.getItem('currentUser') ||
        localStorage.getItem('app_current_user') ||
        localStorage.getItem('user');
      if (s) user = JSON.parse(s);
    } catch {}
  }
  if (!user) return false;
  const role = String(user.role || user.user_role || '').trim().toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  const login = String(user.login || user.username || '').trim().toLowerCase();

  // Strict check: standard non-admin roles can never be admin
  if (
    role === 'инспектор' ||
    role === 'старший инспектор' ||
    role === 'дознаватель' ||
    role === 'специалист' ||
    role === 'inspector'
  ) {
    return false;
  }

  return (
    role.includes('админ') ||
    role.includes('admin') ||
    email === 'dbykov338@gmail.com' ||
    email === 'dbykov141@gmail.com' ||
    email === 'admin@mchs.gov.ru' ||
    (email.startsWith('admin@') || email === 'admin') ||
    (login === 'admin' || login.startsWith('admin@')) ||
    user.is_superuser === true ||
    user.is_admin === true
  );
};
