import { saveAs } from 'file-saver';
import { Facility, Inspection, Equipment, Inspector, AuditLogEntry } from '../types';

export const downloadCsvFile = (content: string, filename: string) => {
  const bom = '\uFEFF';
  const blob = new Blob([bom + content], { type: 'text/csv;charset=utf-8;' });
  saveAs(blob, filename);
};

export const downloadJsonFile = (data: unknown, filename: string) => {
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  saveAs(blob, filename);
};

export const exportFacilitiesToCsv = (facilities: Facility[]) => {
  const headers = ['ID', 'Наименование объекта', 'Фактический адрес', 'Категория риска', 'Кадастровый номер', 'Ответственное лицо'];
  const rows = facilities.map((f) => [
    f.id,
    `"${(f.name || '').replace(/"/g, '""')}"`,
    `"${(f.address || '').replace(/"/g, '""')}"`,
    `"${f.risk_level}"`,
    `"${f.cadastral_number || '-'}"`,
    `"${(f.responsible_person || '-').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadCsvFile(csvContent, `Реестр_объектов_ГПН_${dateStr}.csv`);
};

export const exportInspectionsToCsv = (
  inspections: Inspection[],
  facilities: Facility[],
  inspectors: Inspector[]
) => {
  const headers = [
    'ID проверки',
    'Дата проверки',
    'Объект надзора',
    'Адрес объекта',
    'Инспектор ГПН',
    'Результат',
    'Номер предписания',
    'Выявленные нарушения'
  ];

  const rows = inspections.map((ins) => {
    const fac = facilities.find((f) => f.id === ins.facility_id);
    const insp = inspectors.find((i) => i.id === ins.inspector_id);

    return [
      ins.id,
      ins.date,
      `"${(fac?.name || `Объект #${ins.facility_id}`).replace(/"/g, '""')}"`,
      `"${(fac?.address || '-').replace(/"/g, '""')}"`,
      `"${(insp?.full_name || `Инспектор #${ins.inspector_id}`).replace(/"/g, '""')}"`,
      `"${ins.result}"`,
      `"${ins.prescription_number || '-'}"`,
      `"${(ins.violations || 'Нарушений не выявлено').replace(/"/g, '""')}"`,
    ];
  });

  const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadCsvFile(csvContent, `Журнал_проверок_ГПН_${dateStr}.csv`);
};

export const exportEquipmentToCsv = (equipment: Equipment[], facilities: Facility[]) => {
  const headers = [
    'ID оборудования',
    'Тип',
    'Наименование / Модель',
    'Серийный номер',
    'Объект привязки',
    'Состояние',
    'Дата последней поверки',
    'Срок следующей поверки',
    'Примечания'
  ];

  const rows = equipment.map((eq) => {
    const fac = facilities.find((f) => f.id === eq.facility_id);
    return [
      eq.id,
      `"${eq.type}"`,
      `"${(eq.name || '-').replace(/"/g, '""')}"`,
      `"${eq.serial_number || '-'}"`,
      `"${(fac?.name || `Объект #${eq.facility_id}`).replace(/"/g, '""')}"`,
      `"${eq.status}"`,
      eq.last_check_date,
      eq.next_check_date || '-',
      `"${(eq.notes || '').replace(/"/g, '""')}"`,
    ];
  });

  const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadCsvFile(csvContent, `Реестр_оборудования_ГПН_${dateStr}.csv`);
};

export const exportAuditLogsToCsv = (auditLogs: AuditLogEntry[]) => {
  const headers = ['ID', 'Дата и время', 'Кто совершил', 'Роль', 'Действие', 'Объект действия', 'Подробности'];
  const rows = auditLogs.map((log) => [
    log.id,
    `"${log.timestamp}"`,
    `"${log.user_name.replace(/"/g, '""')}"`,
    `"${log.user_role}"`,
    `"${log.action}"`,
    `"${log.target.replace(/"/g, '""')}"`,
    `"${(log.details || '-').replace(/"/g, '""')}"`,
  ]);

  const csvContent = [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
  const dateStr = new Date().toISOString().slice(0, 10);
  downloadCsvFile(csvContent, `Журнал_аудита_ГПН_${dateStr}.csv`);
};

export const exportFullDatabaseBackup = (
  facilitiesOrObj: any,
  maybeInspections?: Inspection[],
  maybeEquipment?: Equipment[],
  maybeInspectors?: Inspector[],
  maybeAuditLogs?: AuditLogEntry[]
) => {
  let facilities: Facility[] = [];
  let inspections: Inspection[] = [];
  let equipment: Equipment[] = [];
  let inspectors: Inspector[] = [];
  let auditLogs: AuditLogEntry[] = [];

  if (facilitiesOrObj && !Array.isArray(facilitiesOrObj) && typeof facilitiesOrObj === 'object') {
    facilities = Array.isArray(facilitiesOrObj.facilities) ? facilitiesOrObj.facilities : [];
    inspections = Array.isArray(facilitiesOrObj.inspections) ? facilitiesOrObj.inspections : [];
    equipment = Array.isArray(facilitiesOrObj.equipment) ? facilitiesOrObj.equipment : [];
    inspectors = Array.isArray(facilitiesOrObj.inspectors) ? facilitiesOrObj.inspectors : [];
    auditLogs = Array.isArray(facilitiesOrObj.auditLogs)
      ? facilitiesOrObj.auditLogs
      : Array.isArray(facilitiesOrObj.audit_logs)
      ? facilitiesOrObj.audit_logs
      : [];
  } else {
    facilities = Array.isArray(facilitiesOrObj) ? facilitiesOrObj : [];
    inspections = Array.isArray(maybeInspections) ? maybeInspections : [];
    equipment = Array.isArray(maybeEquipment) ? maybeEquipment : [];
    inspectors = Array.isArray(maybeInspectors) ? maybeInspectors : [];
    auditLogs = Array.isArray(maybeAuditLogs) ? maybeAuditLogs : [];
  }

  if (facilities.length === 0) {
    try {
      const saved = localStorage.getItem('app_facilities');
      if (saved) facilities = JSON.parse(saved);
    } catch {}
  }
  if (inspections.length === 0) {
    try {
      const saved = localStorage.getItem('app_inspections');
      if (saved) inspections = JSON.parse(saved);
    } catch {}
  }
  if (equipment.length === 0) {
    try {
      const saved = localStorage.getItem('app_equipment');
      if (saved) equipment = JSON.parse(saved);
    } catch {}
  }
  if (inspectors.length === 0) {
    try {
      const saved = localStorage.getItem('app_inspectors') || localStorage.getItem('inspectors_registry');
      if (saved) inspectors = JSON.parse(saved);
    } catch {}
  }
  if (auditLogs.length === 0) {
    try {
      const saved = localStorage.getItem('audit_logs_v1');
      if (saved) auditLogs = JSON.parse(saved);
    } catch {}
  }

  let storedUsers: any[] = [];
  try {
    const raw = localStorage.getItem('app_users_credentials') || localStorage.getItem('inspectors_registry') || '[]';
    storedUsers = JSON.parse(raw);
  } catch {}

  const fullUsers = (inspectors || []).map(insp => {
    const match = storedUsers.find((u: any) => u.id === insp.id || u.email === insp.email);
    return {
      ...insp,
      login: insp.login || (match && match.login) || (insp.email ? insp.email.split('@')[0] : 'user'),
      password_hash: (match && match.password_hash) || insp.password_hash || undefined,
      password: (match && match.password) || insp.password || undefined,
      two_factor_secret: insp.two_factor_secret || (match && match.two_factor_secret) || undefined,
      backup_codes: insp.backup_codes || (match && match.backup_codes) || undefined
    };
  });

  const payload: BackupPayload = {
    version: '1.0.0',
    export_date: new Date().toISOString(),
    system: 'АС Пожнадзор (ГОСТ Р 57580.1)',
    environment: 'production',
    checksum_algo: 'SHA-256',
    database: {
      facilities,
      inspections,
      equipment,
      inspectors: fullUsers,
      users: fullUsers,
      audit_logs: auditLogs
    }
  };

  const filename = `Резервная_копия_ПожНадзор_${new Date().toISOString().slice(0, 10)}.json`;
  downloadJsonFile(payload, filename);
};
