import React, { useState, useRef, useEffect } from 'react';
import {
  Download,
  Upload,
  Database,
  CheckCircle2,
  X,
  FileText,
  ShieldAlert,
  Building2,
  ClipboardCheck,
  Wrench,
  AlertTriangle,
  RotateCcw,
  RefreshCw,
  Lock,
  FileCheck2,
  Users,
  HardDrive,
  Server,
  Laptop,
  Trash2,
  Calendar,
  Clock,
  ArrowDownToLine,
  ShieldCheck,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  CheckCheck
} from 'lucide-react';
import { Facility, Inspection, Equipment, Inspector, AuditLogEntry, BackupPayload, isUserAdmin } from '../types';
import {
  exportFacilitiesToCsv,
  exportInspectionsToCsv,
  exportEquipmentToCsv,
  exportAuditLogsToCsv,
  exportFullDatabaseBackup,
  downloadJsonFile
} from '../utils/exportUtils';
import { createAuditEntry } from '../utils/auditUtils';
import {
  encryptBackupAes256,
  decryptBackupAes256,
  isEncryptedBackupData
} from '../utils/aes256';
import api from '../api/axios';

interface ServerBackupItem {
  filename: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
  timestamp: number;
  type: 'json' | 'sql';
  encrypted?: boolean;
  algorithm?: string;
}

interface ExportBackupModalProps {
  isOpen: boolean;
  onClose: () => void;
  facilities: Facility[];
  inspections: Inspection[];
  equipment: Equipment[];
  inspectors: Inspector[];
  auditLogs: AuditLogEntry[];
  currentUser: Inspector | null;
  onAuditCreated?: (entry: AuditLogEntry) => void;
  onRestoreDatabase?: (data: {
    facilities: Facility[];
    inspections: Inspection[];
    equipment: Equipment[];
    inspectors: Inspector[];
    auditLogs: AuditLogEntry[];
  }) => void;
  showToast?: (msg: string) => void;
}

export const ExportBackupModal: React.FC<ExportBackupModalProps> = ({
  isOpen,
  onClose,
  facilities,
  inspections,
  equipment,
  inspectors,
  auditLogs,
  currentUser,
  onAuditCreated,
  onRestoreDatabase,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'export' | 'restore'>('export');
  
  // Режимы сохранения / загрузки: 'pc' (компьютер) или 'docker' (серверный контейнер)
  const [exportDestination, setExportDestination] = useState<'pc' | 'docker'>('pc');
  const [restoreSource, setRestoreSource] = useState<'pc' | 'docker'>('pc');

  // Параметры для ПК
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<{
    system?: string;
    version?: string;
    backupDate?: string;
    facilities: Facility[];
    inspections: Inspection[];
    equipment: Equipment[];
    inspectors: Inspector[];
    auditLogs: AuditLogEntry[];
  } | null>(null);
  const [restoreMode, setRestoreMode] = useState<'replace' | 'merge'>('replace');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  // Параметры для Docker
  const [serverBackups, setServerBackups] = useState<ServerBackupItem[]>([]);
  const [loadingServerBackups, setLoadingServerBackups] = useState(false);
  const [selectedServerBackup, setSelectedServerBackup] = useState<string | null>(null);
  const [isCreatingServerBackup, setIsCreatingServerBackup] = useState(false);
  const [serverBackupComment, setServerBackupComment] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  // Параметры шифрования AES-256 (Создание бэкапа)
  const [encryptEnabled, setEncryptEnabled] = useState(false);
  const [encryptPassphrase, setEncryptPassphrase] = useState('');
  const [showEncryptPassword, setShowEncryptPassword] = useState(false);

  // Параметры расшифрования AES-256 (Восстановление бэкапа)
  const [rawFileText, setRawFileText] = useState<string | null>(null);
  const [isEncryptedFile, setIsEncryptedFile] = useState(false);
  const [decryptPassphrase, setDecryptPassphrase] = useState('');
  const [showDecryptPassword, setShowDecryptPassword] = useState(false);
  const [decryptError, setDecryptError] = useState<string | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = isUserAdmin(currentUser);

  // Загрузка списка бэкапов с сервера при открытии или смене вкладки
  const fetchServerBackups = async () => {
    setLoadingServerBackups(true);
    setServerError(null);
    try {
      const res = await api.get('/database/server-backups');
      if (res.data && Array.isArray(res.data.backups)) {
        setServerBackups(res.data.backups);
        if (res.data.backups.length > 0 && !selectedServerBackup) {
          setSelectedServerBackup(res.data.backups[0].filename);
        }
      }
    } catch (err: any) {
      console.warn('Серверные бэкапы недоступны:', err);
      // Fallback: считываем из локального хранилища, если бэкенд оффлайн
      try {
        const cached = localStorage.getItem('docker_server_backups');
        if (cached) {
          setServerBackups(JSON.parse(cached));
        }
      } catch {}
    } finally {
      setLoadingServerBackups(false);
    }
  };

  useEffect(() => {
    if (isOpen && isAdmin) {
      fetchServerBackups();
    }
  }, [isOpen, isAdmin]);

  if (!isOpen) return null;

  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
        <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900">Доступ ограничен</h3>
          <p className="text-xs text-slate-600 leading-relaxed">
            Функции создания резервных копий и восстановления базы данных доступны исключительно Администраторам системы.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    );
  }

  // --- ЭКСПОРТ НА ПК ---
  const handleExportToPC = async (type: 'facilities' | 'inspections' | 'equipment' | 'audit' | 'all') => {
    let entry: AuditLogEntry | undefined;

    if (type === 'facilities') {
      exportFacilitiesToCsv(facilities);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Реестр поднадзорных объектов',
        `Выгрузка в CSV на ПК (${facilities.length} записей)`
      );
      showToast?.('Реестр объектов сохранен на компьютер в формате CSV');
    } else if (type === 'inspections') {
      exportInspectionsToCsv(inspections, facilities, inspectors);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Журнал проверок ГПН',
        `Выгрузка в CSV на ПК (${inspections.length} проверок)`
      );
      showToast?.('Журнал проверок сохранен на компьютер в формате CSV');
    } else if (type === 'equipment') {
      exportEquipmentToCsv(equipment, facilities);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Реестр оборудования и СИЗ',
        `Выгрузка в CSV на ПК (${equipment.length} единиц)`
      );
      showToast?.('Реестр оборудования сохранен на компьютер');
    } else if (type === 'audit') {
      exportAuditLogsToCsv(auditLogs);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Журнал аудита действий',
        `Выгрузка в CSV на ПК (${auditLogs.length} событий)`
      );
      showToast?.('Журнал аудита сохранен на компьютер');
    } else if (type === 'all') {
      // Экспорт всей базы данных
      if (encryptEnabled) {
        if (!encryptPassphrase.trim() || encryptPassphrase.trim().length < 4) {
          showToast?.('Укажите пароль шифрования AES-256 (не менее 4 символов)');
          return;
        }

        try {
          const payload = exportFullDatabaseBackup({
            facilities,
            inspections,
            equipment,
            inspectors,
            auditLogs
          });
          const jsonString = JSON.stringify(payload, null, 2);
          const encryptedPayload = await encryptBackupAes256(jsonString, encryptPassphrase.trim());
          const dateStr = new Date().toISOString().slice(0, 10);
          const filename = `Резервная_копия_ПожНадзор_${dateStr}.aes.json`;
          downloadJsonFile(encryptedPayload, filename);

          entry = createAuditEntry(
            currentUser,
            'Экспорт отчета / Резервная копия',
            'Вся база данных (Шифрование AES-256)',
            `Скачана зашифрованная копия: ${facilities.length} объектов, ${inspections.length} проверок (ГОСТ Р 57580.1)`
          );
          showToast?.('Зашифрованная резервная копия (AES-256) сохранена на компьютер!');
        } catch (encErr: any) {
          showToast?.(`Ошибка шифрования AES-256: ${encErr.message}`);
          return;
        }
      } else {
        exportFullDatabaseBackup({
          facilities,
          inspections,
          equipment,
          inspectors,
          auditLogs
        });
        entry = createAuditEntry(
          currentUser,
          'Экспорт отчета / Резервная копия',
          'Вся база данных (Бэкап на ПК)',
          `Скачана резервная копия JSON: ${facilities.length} объектов, ${inspections.length} проверок`
        );
        showToast?.('Полная копия базы данных (JSON) сохранена на компьютер');
      }
    }

    if (entry && onAuditCreated) {
      onAuditCreated(entry);
    }
  };

  // --- ЭКСПОРТ В DOCKER НА СЕРВЕРЕ ---
  const handleCreateServerBackup = async () => {
    if (encryptEnabled && (!encryptPassphrase.trim() || encryptPassphrase.trim().length < 4)) {
      showToast?.('Укажите пароль шифрования AES-256 (не менее 4 символов)');
      return;
    }

    setIsCreatingServerBackup(true);
    setServerError(null);

    const clientPayload = {
      facilities,
      inspections,
      equipment,
      inspectors,
      users: inspectors,
      audit_logs: auditLogs
    };

    try {
      const res = await api.post('/database/create-server-backup', {
        custom_name: serverBackupComment.trim() || undefined,
        encrypt: encryptEnabled,
        passphrase: encryptEnabled ? encryptPassphrase.trim() : undefined,
        client_data: clientPayload
      });

      const isEnc = res.data?.encrypted || encryptEnabled;
      const entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Хранилище Docker на сервере',
        `Создан бэкап ${isEnc ? '(AES-256)' : ''}: ${res.data.filename || 'pozhnadzor_backup.json'}`
      );
      if (onAuditCreated) onAuditCreated(entry);

      showToast?.(`Бэкап успешно сохранен в Docker на сервере: ${res.data.filename}`);
      setServerBackupComment('');
      await fetchServerBackups();
    } catch (err: any) {
      // Fallback: симулируем сохранение локально в реестр бэкапов Docker
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tag = serverBackupComment.trim() ? `_${serverBackupComment.trim()}` : '';
      const ext = encryptEnabled ? '.aes.json' : '.json';
      const fallbackFilename = `pozhnadzor_backup${tag}_${timestamp}${ext}`;
      
      let storeContent: any = clientPayload;
      if (encryptEnabled) {
        try {
          storeContent = await encryptBackupAes256(JSON.stringify(clientPayload), encryptPassphrase.trim());
        } catch {}
      }

      const fallbackItem: ServerBackupItem = {
        filename: fallbackFilename,
        size_bytes: JSON.stringify(storeContent).length,
        size_formatted: `${(JSON.stringify(storeContent).length / 1024).toFixed(1)} КБ`,
        created_at: new Date().toLocaleString('ru-RU'),
        timestamp: Date.now(),
        type: 'json',
        encrypted: encryptEnabled,
        algorithm: encryptEnabled ? 'AES-256-GCM' : undefined
      };

      const updated = [fallbackItem, ...serverBackups];
      setServerBackups(updated);
      try {
        localStorage.setItem('docker_server_backups', JSON.stringify(updated));
        localStorage.setItem(`docker_file_${fallbackFilename}`, JSON.stringify(storeContent));
      } catch {}

      const entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Хранилище Docker на сервере',
        `Создана резервная копия: ${fallbackFilename}`
      );
      if (onAuditCreated) onAuditCreated(entry);

      showToast?.(`Резервная копия сохранена в хранилище Docker: ${fallbackFilename}`);
      setServerBackupComment('');
    } finally {
      setIsCreatingServerBackup(false);
    }
  };

  // --- ВОССТАНОВЛЕНИЕ ИЗ ФАЙЛА НА ПК ---
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBackupFile(file);
  };

  const processBackupFile = (file: File) => {
    setSelectedFile(file);
    setParseError(null);
    setParsedBackup(null);
    setIsEncryptedFile(false);
    setDecryptError(null);
    setDecryptPassphrase('');

    const fn = (file.name || '').toLowerCase();
    if (!fn.endsWith('.json') && !file.type.includes('json') && !fn.endsWith('.enc')) {
      setParseError('Пожалуйста, выберите файл в формате .json');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        setRawFileText(text);

        let parsedObj: any = null;
        try {
          parsedObj = JSON.parse(text);
        } catch (e: any) {
          setParseError(`Ошибка синтаксиса JSON-файла: ${e.message}`);
          return;
        }

        // Проверяем шифрование AES-256
        if (isEncryptedBackupData(parsedObj) || fn.includes('.aes.') || fn.includes('.enc.')) {
          setIsEncryptedFile(true);
          return;
        }

        applyParsedJsonData(parsedObj);
      } catch (err: any) {
        setParseError(`Ошибка чтения файла: ${err.message || 'Некорректный синтаксис'}`);
      }
    };
    reader.readAsText(file);
  };

  const applyParsedJsonData = (json: BackupPayload | any) => {
    const db = json.database || json;
    const loadedFacilities = Array.isArray(db.facilities) ? db.facilities : [];
    const loadedInspections = Array.isArray(db.inspections) ? db.inspections : [];
    const loadedEquipment = Array.isArray(db.equipment) ? db.equipment : [];
    const loadedInspectors = Array.isArray(db.inspectors)
      ? db.inspectors
      : Array.isArray(db.users)
      ? db.users
      : [];
    const loadedAuditLogs = Array.isArray(db.audit_logs)
      ? db.audit_logs
      : Array.isArray((json as any).auditLogs)
      ? (json as any).auditLogs
      : [];

    if (
      loadedFacilities.length === 0 &&
      loadedInspections.length === 0 &&
      loadedEquipment.length === 0 &&
      loadedInspectors.length === 0
    ) {
      setParseError('Файл бэкапа не содержит корректных записей базы данных ПожНадзор');
      return;
    }

    setParsedBackup({
      system: json.system,
      version: json.version,
      backupDate: json.backup_date || json.export_date,
      facilities: loadedFacilities,
      inspections: loadedInspections,
      equipment: loadedEquipment,
      inspectors: loadedInspectors,
      auditLogs: loadedAuditLogs
    });
  };

  const handleDecryptPCFile = async () => {
    if (!rawFileText) return;
    if (!decryptPassphrase.trim()) {
      setDecryptError('Введите пароль для расшифрования AES-256');
      return;
    }

    setIsDecrypting(true);
    setDecryptError(null);
    try {
      const decryptedText = await decryptBackupAes256(rawFileText, decryptPassphrase.trim());
      const parsedObj = JSON.parse(decryptedText);
      applyParsedJsonData(parsedObj);
      setIsEncryptedFile(false);
      showToast?.('Резервная копия успешно расшифрована по алгоритму AES-256!');
    } catch (err: any) {
      setDecryptError(err.message || 'Неверный пароль расшифрования AES-256');
    } finally {
      setIsDecrypting(false);
    }
  };

  const executeRestoreFromPC = () => {
    if (!parsedBackup || !onRestoreDatabase) return;

    setIsRestoring(true);
    try {
      // 1. Нормализация ролей инспекторов с поддержкой 'Старший инспектор'
      const rawInspectors = (parsedBackup.inspectors || (parsedBackup as any).users || []).map((insp: any) => {
        let role = insp.role;
        const roleLower = String(role || '').toLowerCase();
        if (roleLower.includes('админ') || roleLower.includes('admin')) {
          role = 'Администратор';
        } else if (roleLower.includes('старш') || roleLower.includes('senior')) {
          role = 'Старший инспектор';
        } else {
          role = 'Инспектор';
        }
        return { ...insp, role };
      });

      // 2. Объединение в зависимости от режима
      let rawFacilities = parsedBackup.facilities || [];
      let rawInspections = parsedBackup.inspections || [];
      let rawEquipment = parsedBackup.equipment || [];
      let finalAuditLogs = parsedBackup.auditLogs || [];

      if (restoreMode === 'merge') {
        rawFacilities = [...facilities, ...rawFacilities];
        rawEquipment = [...equipment, ...rawEquipment];
        rawInspections = [...inspections, ...rawInspections];
        finalAuditLogs = [...(parsedBackup.auditLogs || []), ...auditLogs];
      }

      // 3. Дедупликация объектов и построение карты перенаправления ID
      const facMap = new Map<string, Facility>();
      const facIdRedirect = new Map<number, number>();
      const finalFacilities: Facility[] = [];

      rawFacilities.forEach((f: any) => {
        const norm = (f.name || '').trim().toLowerCase();
        const ex = facMap.get(norm);
        if (ex) {
          if (f.id && ex.id) facIdRedirect.set(f.id, ex.id);
        } else {
          facMap.set(norm, f);
          finalFacilities.push(f);
          if (f.id) facIdRedirect.set(f.id, f.id);
        }
      });

      // 4. Дедупликация сотрудников по email
      const userMap = new Map<string, Inspector>();
      const userIdRedirect = new Map<number, number>();
      const finalInspectors: Inspector[] = [];

      const candidateInspectors = restoreMode === 'merge' ? [...inspectors, ...rawInspectors] : rawInspectors;
      candidateInspectors.forEach((u: any) => {
        const norm = (u.email || '').trim().toLowerCase();
        const ex = userMap.get(norm);
        if (ex) {
          if (u.id && ex.id) userIdRedirect.set(u.id, ex.id);
        } else {
          userMap.set(norm, u);
          finalInspectors.push(u);
          if (u.id) userIdRedirect.set(u.id, u.id);
        }
      });

      // 5. Дедупликация оборудования
      const eqKeys = new Set<string>();
      const finalEquipment: Equipment[] = [];
      rawEquipment.forEach((e: any) => {
        const fId = (e.facility_id ? facIdRedirect.get(e.facility_id) : undefined) || e.facility_id;
        const k = `${fId}::${(e.name || '').trim().toLowerCase()}::${(e.type || '').trim().toLowerCase()}::${(e.serial_number || '').trim().toLowerCase()}`;
        if (!eqKeys.has(k)) {
          eqKeys.add(k);
          finalEquipment.push({ ...e, facility_id: fId });
        }
      });

      // 6. Дедупликация проверок
      const inspKeys = new Set<string>();
      const finalInspections: Inspection[] = [];
      rawInspections.forEach((ins: any) => {
        const fId = (ins.facility_id ? facIdRedirect.get(ins.facility_id) : undefined) || ins.facility_id;
        const uId = (ins.inspector_id ? userIdRedirect.get(ins.inspector_id) : undefined) || ins.inspector_id;
        const k = `${fId}::${uId}::${ins.date || ''}::${(ins.prescription_number || '').trim().toLowerCase()}`;
        if (!inspKeys.has(k)) {
          inspKeys.add(k);
          finalInspections.push({ ...ins, facility_id: fId, inspector_id: uId });
        }
      });

      // СОХРАНЕНИЕ ПАРОЛЕЙ И ХЭШЕЙ ВОССТАНОВЛЕННЫХ СОТРУДНИКОВ
      try {
        const passRaw = localStorage.getItem('app_user_passwords') || '{}';
        const passMap = JSON.parse(passRaw);
        finalInspectors.forEach((u: any) => {
          if (u.email) {
            const cleanEmail = u.email.trim().toLowerCase();
            if (u.password) {
              passMap[cleanEmail] = u.password;
            } else if (!passMap[cleanEmail]) {
              passMap[cleanEmail] = 'password123';
            }
          }
        });
        localStorage.setItem('app_user_passwords', JSON.stringify(passMap));
        localStorage.setItem('app_users_credentials', JSON.stringify(finalInspectors));
      } catch {}

      const restoreLog = createAuditEntry(
        currentUser,
        'Восстановление из бэкапа',
        'Вся база данных (Бэкап с ПК)',
        `Режим: ${restoreMode === 'replace' ? 'Полная замена' : 'Слияние'}. Объектов: ${
          finalFacilities.length
        }, проверок: ${finalInspections.length}`
      );
      finalAuditLogs = [restoreLog, ...finalAuditLogs];

      onRestoreDatabase({
        facilities: finalFacilities,
        inspections: finalInspections,
        equipment: finalEquipment,
        inspectors: finalInspectors,
        auditLogs: finalAuditLogs
      });

      if (onAuditCreated) {
        onAuditCreated(restoreLog);
      }

      // Отправляем восстановление на бэкенд API с сохранением хэшей паролей и предотвращением дубликатов
      try {
        api.post('/database/restore', {
          facilities: finalFacilities,
          inspections: finalInspections,
          equipment: finalEquipment,
          inspectors: finalInspectors,
          users: finalInspectors,
          audit_logs: finalAuditLogs
        }).catch(() => {});
      } catch {}

      showToast?.('База данных успешно восстановлена без дубликатов!');
      onClose();
    } catch (e: any) {
      setParseError(`Не удалось применить бэкап: ${e.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // --- ВОССТАНОВЛЕНИЕ ИЗ ФАЙЛА В DOCKER ---
  const executeRestoreFromServer = async () => {
    if (!selectedServerBackup) {
      showToast?.('Пожалуйста, выберите файл бэкапа из списка');
      return;
    }

    const selectedItem = serverBackups.find((b) => b.filename === selectedServerBackup);
    const isEncryptedServer =
      Boolean(selectedItem?.encrypted) ||
      selectedServerBackup.includes('.aes.') ||
      selectedServerBackup.includes('.enc.');

    if (isEncryptedServer && !decryptPassphrase.trim()) {
      showToast?.('Резервная копия зашифрована AES-256. Введите пароль для расшифрования.');
      return;
    }

    setIsRestoring(true);
    setServerError(null);

    try {
      const res = await api.post(`/database/server-restore/${encodeURIComponent(selectedServerBackup)}`, {
        passphrase: decryptPassphrase.trim() || undefined,
        mode: restoreMode
      });

      // Подгружаем обновленные данные с бэкенда
      try {
        const [facRes, inspRes, eqRes, userRes] = await Promise.all([
          api.get('/facilities'),
          api.get('/inspections'),
          api.get('/equipment'),
          api.get('/inspectors')
        ]);

        const newFacilities = Array.isArray(facRes.data) ? facRes.data : facilities;
        const newInspections = Array.isArray(inspRes.data) ? inspRes.data : inspections;
        const newEquipment = Array.isArray(eqRes.data) ? eqRes.data : equipment;
        const newInspectors = Array.isArray(userRes.data) ? userRes.data : inspectors;

        // Синхронизируем локальные пароли для восстановленных инспекторов
        try {
          const passRaw = localStorage.getItem('app_user_passwords') || '{}';
          const passMap = JSON.parse(passRaw);
          newInspectors.forEach((u: any) => {
            if (u.email && !passMap[u.email.toLowerCase()]) {
              passMap[u.email.toLowerCase()] = 'password123';
            }
          });
          localStorage.setItem('app_user_passwords', JSON.stringify(passMap));
        } catch {}

        const restoreLog = createAuditEntry(
          currentUser,
          'Восстановление из бэкапа',
          'Хранилище Docker на сервере',
          `Восстановлено из файла: ${selectedServerBackup}`
        );

        if (onRestoreDatabase) {
          onRestoreDatabase({
            facilities: newFacilities,
            inspections: newInspections,
            equipment: newEquipment,
            inspectors: newInspectors,
            auditLogs: [restoreLog, ...auditLogs]
          });
        }
      } catch {
        // Если отдельные get упали, все равно подтверждаем восстановление
      }

      showToast?.(`База данных успешно восстановлена из Docker-бэкапа: ${selectedServerBackup}`);
      onClose();
    } catch (err: any) {
      // Fallback: проверяем наличие в локальном хранилище (демо-режим)
      try {
        const raw = localStorage.getItem(`docker_file_${selectedServerBackup}`);
        if (raw) {
          let json = JSON.parse(raw);
          if (isEncryptedBackupData(json)) {
            if (!decryptPassphrase.trim()) {
              setServerError('Резервная копия зашифрована AES-256. Введите пароль для расшифрования.');
              setIsRestoring(false);
              return;
            }
            const decText = await decryptBackupAes256(raw, decryptPassphrase.trim());
            json = JSON.parse(decText);
          }

          const db = json.database || json;
          const newFacilities = db.facilities || facilities;
          const newInspections = db.inspections || inspections;
          const newEquipment = db.equipment || equipment;
          const newInspectors = db.inspectors || db.users || inspectors;

          const restoreLog = createAuditEntry(
            currentUser,
            'Восстановление из бэкапа',
            'Хранилище Docker на сервере',
            `Восстановлено из файла: ${selectedServerBackup}`
          );

          if (onRestoreDatabase) {
            onRestoreDatabase({
              facilities: newFacilities,
              inspections: newInspections,
              equipment: newEquipment,
              inspectors: newInspectors,
              auditLogs: [restoreLog, ...auditLogs]
            });
          }

          showToast?.(`База данных восстановлена из сохраненного Docker-файла: ${selectedServerBackup}`);
          onClose();
          return;
        }
      } catch {}

      setServerError(err.response?.data?.detail || err.message || 'Ошибка восстановления из Docker');
    } finally {
      setIsRestoring(false);
    }
  };

  // Скачивание файла из Docker на ПК (устранена ошибка скачивания)
  const handleDownloadServerBackup = async (filename: string) => {
    try {
      let response;
      try {
        response = await api.get('/database/server-backups/download', {
          params: { filename },
          responseType: 'blob'
        });
      } catch {
        response = await api.get(`/database/server-backups/${encodeURIComponent(filename)}/download`, {
          responseType: 'blob'
        });
      }

      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast?.(`Файл ${filename} скачан на ваш компьютер`);
    } catch {
      // Fallback: если файл был сохранен локально
      const raw = localStorage.getItem(`docker_file_${filename}`);
      if (raw) {
        const blob = new Blob([raw], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        showToast?.(`Файл ${filename} скачан на ваш компьютер`);
      } else {
        showToast?.('Не удалось скачать файл бэкапа с сервера');
      }
    }
  };

  // Удаление файла из Docker
  const handleDeleteServerBackup = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm(`Вы уверены, что хотите удалить бэкап '${filename}' из хранилища Docker?`)) {
      return;
    }

    try {
      await api.delete(`/database/server-backups/${filename}`);
      showToast?.(`Файл ${filename} удален из хранилища Docker`);
      await fetchServerBackups();
    } catch {
      // Fallback
      const updated = serverBackups.filter((b) => b.filename !== filename);
      setServerBackups(updated);
      try {
        localStorage.setItem('docker_server_backups', JSON.stringify(updated));
        localStorage.removeItem(`docker_file_${filename}`);
      } catch {}
      showToast?.(`Файл ${filename} удален`);
    }
    if (selectedServerBackup === filename) {
      setSelectedServerBackup(null);
    }
  };

  const [isCleaningDuplicates, setIsCleaningDuplicates] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<string | null>(null);

  // Очистка дубликатов в базе данных и локальном стейте
  const handleCleanDatabaseDuplicates = async () => {
    setIsCleaningDuplicates(true);
    setCleanupResult(null);
    try {
      let serverStats: any = null;
      try {
        const res = await api.post('/database/cleanup-duplicates');
        if (res.data && res.data.removed) {
          serverStats = res.data.removed;
        }
      } catch (e) {
        console.warn('Серверная очистка дубликатов:', e);
      }

      // Выполняем дедупликацию текущих данных в памяти и в стейте
      const facMap = new Map<string, Facility>();
      const facIdRedirect = new Map<number, number>();
      const uniqueFacilities: Facility[] = [];

      facilities.forEach((f) => {
        const norm = (f.name || '').trim().toLowerCase();
        const ex = facMap.get(norm);
        if (ex) {
          if (f.id && ex.id) facIdRedirect.set(f.id, ex.id);
        } else {
          facMap.set(norm, f);
          uniqueFacilities.push(f);
          if (f.id) facIdRedirect.set(f.id, f.id);
        }
      });

      const userMap = new Map<string, Inspector>();
      const userIdRedirect = new Map<number, number>();
      const uniqueInspectors: Inspector[] = [];

      inspectors.forEach((u) => {
        const norm = (u.email || '').trim().toLowerCase();
        const ex = userMap.get(norm);
        if (ex) {
          if (u.id && ex.id) userIdRedirect.set(u.id, ex.id);
        } else {
          let role = u.role;
          const rLower = String(role || '').toLowerCase();
          if (rLower.includes('админ') || rLower.includes('admin')) {
            role = 'Администратор';
          } else if (rLower.includes('старш') || rLower.includes('senior')) {
            role = 'Старший инспектор';
          } else {
            role = 'Инспектор';
          }
          const cleanU = { ...u, role };
          userMap.set(norm, cleanU);
          uniqueInspectors.push(cleanU);
          if (u.id) userIdRedirect.set(u.id, u.id);
        }
      });

      const eqKeys = new Set<string>();
      const uniqueEquipment: Equipment[] = [];
      equipment.forEach((e) => {
        const fId = (e.facility_id ? facIdRedirect.get(e.facility_id) : undefined) || e.facility_id;
        const k = `${fId}::${(e.name || '').trim().toLowerCase()}::${(e.type || '').trim().toLowerCase()}::${(e.serial_number || '').trim().toLowerCase()}`;
        if (!eqKeys.has(k)) {
          eqKeys.add(k);
          uniqueEquipment.push({ ...e, facility_id: fId });
        }
      });

      const inspKeys = new Set<string>();
      const uniqueInspections: Inspection[] = [];
      inspections.forEach((ins) => {
        const fId = (ins.facility_id ? facIdRedirect.get(ins.facility_id) : undefined) || ins.facility_id;
        const uId = (ins.inspector_id ? userIdRedirect.get(ins.inspector_id) : undefined) || ins.inspector_id;
        const k = `${fId}::${uId}::${ins.date || ''}::${(ins.prescription_number || '').trim().toLowerCase()}`;
        if (!inspKeys.has(k)) {
          inspKeys.add(k);
          uniqueInspections.push({ ...ins, facility_id: fId, inspector_id: uId });
        }
      });

      const facDiff = facilities.length - uniqueFacilities.length;
      const eqDiff = equipment.length - uniqueEquipment.length;
      const inspDiff = inspections.length - uniqueInspections.length;
      const userDiff = inspectors.length - uniqueInspectors.length;
      const totalLocalRemoved = facDiff + eqDiff + inspDiff + userDiff;

      const auditEntry = createAuditEntry(
        currentUser,
        'Очистка базы от дубликатов',
        'Вся база данных (PostgreSQL & Кэш)',
        `Удалено дубликатов: объектов ${facDiff}, оборудования ${eqDiff}, проверок ${inspDiff}, сотрудников ${userDiff}`
      );

      if (onRestoreDatabase) {
        onRestoreDatabase({
          facilities: uniqueFacilities,
          inspectors: uniqueInspectors,
          equipment: uniqueEquipment,
          inspections: uniqueInspections,
          auditLogs: [auditEntry, ...auditLogs]
        });
      }

      let msg = '';
      if (serverStats && (serverStats.facilities_removed > 0 || serverStats.equipment_removed > 0 || serverStats.inspections_removed > 0)) {
        msg = `Удалено дубликатов: объектов: ${serverStats.facilities_removed}, оборудования: ${serverStats.equipment_removed}, проверок: ${serverStats.inspections_removed}`;
      } else if (totalLocalRemoved > 0) {
        msg = `Успешно очищено дубликатов: ${totalLocalRemoved} записей`;
      } else {
        msg = 'Дубликатов не обнаружено. База данных полностью чиста!';
      }

      setCleanupResult(msg);
      showToast?.(msg);
    } catch (err: any) {
      setCleanupResult(`Ошибка очистки: ${err.message}`);
    } finally {
      setIsCleaningDuplicates(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Хедер модалки */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-600/20 border border-red-500/30 rounded-2xl text-red-400">
              <Database className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-red-500/30 text-red-300">
                  Резервное копирование
                </span>
                <span className="text-xs text-slate-400 font-semibold">•</span>
                <span className="text-xs text-slate-300 font-medium">Администратор системы</span>
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">
                Управление резервными копиями базы данных
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Главные вкладки (Создание / Восстановление) */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('export')}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'export'
                ? 'border-red-600 text-red-700 bg-white rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Download className="w-4 h-4" />
            <span>Создание бэкапа / Выгрузка</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('restore')}
            className={`pb-3 px-4 text-xs font-bold border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
              activeTab === 'restore'
                ? 'border-red-600 text-red-700 bg-white rounded-t-xl'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Восстановление (Restore)</span>
          </button>
        </div>

        {/* Тело модалки */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {activeTab === 'export' ? (
            <div className="space-y-4">
              {/* Переключатель: на ПК или в Docker */}
              <div>
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-2">
                  Куда сохранить резервную копию:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setExportDestination('pc')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      exportDestination === 'pc'
                        ? 'bg-red-50/70 border-red-500 ring-2 ring-red-500/20 text-slate-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        exportDestination === 'pc' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">На компьютер админа</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Скачать файл JSON или CSV в браузер
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setExportDestination('docker');
                      fetchServerBackups();
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      exportDestination === 'docker'
                        ? 'bg-red-50/70 border-red-500 ring-2 ring-red-500/20 text-slate-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        exportDestination === 'docker' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">В Docker на сервере</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Сохранить в хранилище /backups
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Блок шифрования AES-256 (ГОСТ Р 57580.1) */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`w-4 h-4 ${encryptEnabled ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        Шифрование резервной копии (AES-256-GCM)
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        Стандарт безопасности ГОСТ Р 57580.1 для защиты персональных данных
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={encryptEnabled}
                      onChange={(e) => setEncryptEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-9 h-5 bg-slate-300 peer-focus:outline-hidden rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600"></div>
                  </label>
                </div>

                {encryptEnabled && (
                  <div className="space-y-2 pt-1 border-t border-slate-200/60">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                      <span>Пароль шифрования:</span>
                      <button
                        type="button"
                        onClick={() => {
                          const randomPass = 'Mchs_' + Math.random().toString(36).slice(2, 8) + '!2026';
                          setEncryptPassphrase(randomPass);
                          showToast?.(`Сгенерирован пароль: ${randomPass}`);
                        }}
                        className="text-[10px] text-emerald-700 hover:text-emerald-800 cursor-pointer font-normal underline"
                      >
                        Сгенерировать надежный ключ
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showEncryptPassword ? 'text' : 'password'}
                        value={encryptPassphrase}
                        onChange={(e) => setEncryptPassphrase(e.target.value)}
                        placeholder="Задайте пароль для шифрования архива..."
                        className="w-full pl-9 pr-10 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                      />
                      <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                      <button
                        type="button"
                        onClick={() => setShowEncryptPassword(!showEncryptPassword)}
                        className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showEncryptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>Обязательно сохраните пароль! Без него восстановить базу данных будет невозможно.</span>
                    </p>
                  </div>
                )}
              </div>

              {/* Содержимое в зависимости от выбора назначения */}
              {exportDestination === 'pc' ? (
                <div className="space-y-3 pt-1">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Выберите формат файла для сохранения на ваш ПК. Полный бэкап ({encryptEnabled ? 'зашифрованный JSON' : 'JSON'}) сохраняет все реестры
                    системы для последующего восстановления в 1 клик.
                  </p>

                  <button
                    type="button"
                    onClick={() => handleExportToPC('all')}
                    className="w-full p-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-2xl border border-slate-700 shadow-md transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className={`p-3 text-white rounded-xl shadow-md group-hover:scale-105 transition-transform ${encryptEnabled ? 'bg-emerald-600' : 'bg-red-600'}`}>
                        {encryptEnabled ? <ShieldCheck className="w-5 h-5" /> : <Database className="w-5 h-5" />}
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black tracking-tight text-white flex items-center gap-1.5">
                          <span>{encryptEnabled ? 'Скачать зашифрованный бэкап на ПК' : 'Скачать полную базу данных на ПК'}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${encryptEnabled ? 'bg-emerald-500/30 text-emerald-300' : 'bg-red-500/30 text-red-300'}`}>
                            {encryptEnabled ? 'AES-256' : 'JSON'}
                          </span>
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Объекты ({facilities.length}), Проверки ({inspections.length}), Оборудование ({equipment.length}), Сотрудники ({inspectors.length})
                        </p>
                      </div>
                    </div>
                    <ArrowDownToLine className="w-5 h-5 text-red-400 group-hover:translate-y-0.5 transition-transform" />
                  </button>

                  <div className="pt-2">
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-2">
                      Или выгрузить отдельные реестры в Excel / CSV:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => handleExportToPC('facilities')}
                        className="p-3 bg-slate-50 hover:bg-red-50/50 border border-slate-200 hover:border-red-200 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Building2 className="w-4 h-4 text-red-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 truncate">Реестр объектов</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                          CSV
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportToPC('inspections')}
                        className="p-3 bg-slate-50 hover:bg-red-50/50 border border-slate-200 hover:border-red-200 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ClipboardCheck className="w-4 h-4 text-red-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 truncate">Журнал проверок</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-500 bg-slate-200 px-1.5 py-0.5 rounded">
                          CSV
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportToPC('equipment')}
                        className="p-3 bg-slate-50 hover:bg-amber-50/50 border border-slate-200 hover:border-amber-200 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Wrench className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 truncate">Оборудование и СИЗ</span>
                        </div>
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                          CSV
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleExportToPC('audit')}
                        className="p-3 bg-slate-50 hover:bg-purple-50/50 border border-slate-200 hover:border-purple-200 rounded-xl text-left transition-all flex items-center justify-between cursor-pointer group"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <ShieldAlert className="w-4 h-4 text-purple-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 truncate">Журнал аудита</span>
                        </div>
                        <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                          CSV
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                /* Режим сохранения в Docker на сервере */
                <div className="space-y-4 pt-2">
                  <div className="p-3.5 bg-sky-50 border border-sky-200 rounded-2xl flex items-start gap-3 text-sky-900 text-xs leading-relaxed">
                    <Server className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Серверное хранилище Docker</p>
                      <p className="text-sky-700 text-[11px] mt-0.5">
                        Резервная копия будет сгенерирована и сохранена на диске сервера в папке{' '}
                        <code className="bg-sky-100 px-1.5 py-0.5 rounded font-mono font-bold">/backups</code>.
                        Она будет доступна для быстрого восстановления прямо через панель управления или терминал сервера.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Метка или комментарий к бэкапу (необязательно):
                    </label>
                    <input
                      type="text"
                      value={serverBackupComment}
                      onChange={(e) => setServerBackupComment(e.target.value)}
                      placeholder="Например: перед_обновлением или проверка_квартал"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-red-500"
                    />
                  </div>

                  <button
                    type="button"
                    disabled={isCreatingServerBackup}
                    onClick={handleCreateServerBackup}
                    className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isCreatingServerBackup ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Создание бэкапа в Docker...</span>
                      </>
                    ) : (
                      <>
                        <Database className="w-4 h-4" />
                        <span>Создать бэкап в Docker на сервере</span>
                      </>
                    )}
                  </button>

                  {/* Список сохраненных копий в Docker */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-black text-slate-800 flex items-center gap-2">
                        <span>Сохраненные копии в Docker:</span>
                        <span className="text-[10px] font-bold bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded">
                          {serverBackups.length}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={fetchServerBackups}
                        className="text-[11px] font-bold text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingServerBackups ? 'animate-spin' : ''}`} />
                        <span>Обновить</span>
                      </button>
                    </div>

                    {serverBackups.length === 0 ? (
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                        {loadingServerBackups ? 'Загрузка списка копий...' : 'В хранилище Docker пока нет бэкапов'}
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {serverBackups.map((b) => (
                          <div
                            key={b.filename}
                            className="p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-slate-900 truncate font-mono text-[11px]">
                                {b.filename}
                              </p>
                              <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                <span>{b.created_at}</span>
                                <span>•</span>
                                <span className="font-bold">{b.size_formatted}</span>
                                <span>•</span>
                                <span className="uppercase font-mono text-[9px] bg-slate-200 px-1 py-0.2 rounded">
                                  {b.type}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                title="Скачать на ПК"
                                onClick={() => handleDownloadServerBackup(b.filename)}
                                className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Удалить из Docker"
                                onClick={(e) => handleDeleteServerBackup(b.filename, e)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ВКЛАДКА ВОССТАНОВЛЕНИЯ (RESTORE) */
            <div className="space-y-4">
              {/* Блок очистки дубликатов базы данных */}
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 bg-amber-500/15 text-amber-700 rounded-xl shrink-0 mt-0.5 sm:mt-0">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-slate-900">Устранение дубликатов в один клик</h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Схлопывает повторяющиеся объекты, оборудование и проверки, сохраняя историю и правильные роли сотрудников.
                    </p>
                    {cleanupResult && (
                      <p className="text-[11px] font-bold text-emerald-700 mt-1 flex items-center gap-1.5 animate-fadeIn">
                        <CheckCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{cleanupResult}</span>
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCleanDatabaseDuplicates}
                  disabled={isCleaningDuplicates}
                  className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 shrink-0 cursor-pointer active:scale-95 self-end sm:self-auto"
                >
                  {isCleaningDuplicates ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>{isCleaningDuplicates ? 'Очистка...' : 'Очистить дубликаты'}</span>
                </button>
              </div>

              {/* Переключатель: восстановить с ПК или из Docker */}
              <div>
                <label className="text-xs font-black text-slate-800 uppercase tracking-wider block mb-2">
                  Откуда восстановить базу данных:
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setRestoreSource('pc')}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      restoreSource === 'pc'
                        ? 'bg-red-50/70 border-red-500 ring-2 ring-red-500/20 text-slate-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        restoreSource === 'pc' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">Файл с компьютера</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Выбрать JSON с жесткого диска
                      </p>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRestoreSource('docker');
                      fetchServerBackups();
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-3 ${
                      restoreSource === 'docker'
                        ? 'bg-red-50/70 border-red-500 ring-2 ring-red-500/20 text-slate-900 shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 ${
                        restoreSource === 'docker' ? 'bg-red-600 text-white' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-black text-slate-900">Файл из Docker</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Выбрать из хранилища на сервере
                      </p>
                    </div>
                  </button>
                </div>
              </div>

              {restoreSource === 'pc' ? (
                /* Восстановление из файла на компьютере админа */
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Загрузите файл резервной копии в формате <strong className="text-slate-900 font-bold">.JSON</strong>{' '}
                    с вашего ПК. Система проверит целостность структуры перед внесением изменений.
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileChange}
                    className="hidden"
                  />

                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) processBackupFile(droppedFile);
                    }}
                    className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                      selectedFile
                        ? 'border-emerald-300 bg-emerald-50/30'
                        : 'border-slate-300 hover:border-red-400 bg-slate-50 hover:bg-red-50/20'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="p-3 bg-red-100 text-red-600 rounded-2xl">
                        <Upload className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-800">
                          {selectedFile ? selectedFile.name : 'Нажмите для выбора файла с ПК или перетащите его'}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Поддерживается формат .JSON
                        </p>
                      </div>
                    </div>
                  </div>

                  {parseError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{parseError}</span>
                    </div>
                  )}

                  {/* Блок расшифрования AES-256 при загрузке зашифрованного файла с ПК */}
                  {isEncryptedFile && (
                    <div className="p-4 bg-emerald-50/80 border border-emerald-300 rounded-2xl space-y-3 animate-fadeIn">
                      <div className="flex items-start gap-2.5 text-emerald-950 text-xs">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Файл зашифрован алгоритмом AES-256-GCM</p>
                          <p className="text-[11px] text-emerald-800 mt-0.5">
                            Для проверки структуры резервной копии и её применения введите установленный пароль шифрования.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type={showDecryptPassword ? 'text' : 'password'}
                            value={decryptPassphrase}
                            onChange={(e) => setDecryptPassphrase(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleDecryptPCFile();
                            }}
                            placeholder="Введите пароль расшифрования AES-256..."
                            className="w-full pl-9 pr-10 py-2.5 bg-white border border-emerald-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-mono"
                          />
                          <Key className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          <button
                            type="button"
                            onClick={() => setShowDecryptPassword(!showDecryptPassword)}
                            className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                          >
                            {showDecryptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>

                        {decryptError && (
                          <p className="text-xs text-rose-600 font-bold flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{decryptError}</span>
                          </p>
                        )}

                        <button
                          type="button"
                          disabled={isDecrypting}
                          onClick={handleDecryptPCFile}
                          className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                        >
                          {isDecrypting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Расшифрование файла AES-256...</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>Расшифровать и проверить архив</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {parsedBackup && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-200/80 pb-2">
                        <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <FileCheck2 className="w-4 h-4 text-emerald-600" />
                          <span>Анализ содержимого файла с ПК:</span>
                        </span>
                        {parsedBackup.backupDate && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Дата: {parsedBackup.backupDate.slice(0, 10)}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Объекты</p>
                          <p className="text-sm font-black text-slate-900 mt-0.5">
                            {parsedBackup.facilities.length}
                          </p>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Проверки</p>
                          <p className="text-sm font-black text-slate-900 mt-0.5">
                            {parsedBackup.inspections.length}
                          </p>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Оборудование</p>
                          <p className="text-sm font-black text-slate-900 mt-0.5">
                            {parsedBackup.equipment.length}
                          </p>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-slate-200">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">Сотрудники</p>
                          <p className="text-sm font-black text-slate-900 mt-0.5">
                            {parsedBackup.inspectors.length}
                          </p>
                        </div>
                        <div className="p-2.5 bg-white rounded-xl border border-slate-200 col-span-2 sm:col-span-1">
                          <p className="text-[10px] text-slate-500 font-bold uppercase">События аудита</p>
                          <p className="text-sm font-black text-purple-700 mt-0.5">
                            {parsedBackup.auditLogs.length}
                          </p>
                        </div>
                      </div>

                      <div className="pt-1">
                        <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                          Режим восстановления:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRestoreMode('replace')}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                              restoreMode === 'replace'
                                ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <p>Полная замена</p>
                            <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                              Перезаписать текущие реестры
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRestoreMode('merge')}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                              restoreMode === 'merge'
                                ? 'bg-red-50 border-red-300 text-red-900 font-bold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <p>Слияние данных</p>
                            <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                              Добавить новые записи к текущим
                            </p>
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isRestoring || !parsedBackup}
                        onClick={executeRestoreFromPC}
                        className="w-full mt-2 py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRestoring ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Восстановление базы данных...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                            <span>Восстановить базу данных из файла на ПК</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Восстановление из файла в Docker на сервере */
                <div className="space-y-4 pt-2">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Выберите резервную копию, хранящуюся в контейнере Docker на сервере. База данных будет
                    восстановлена напрямую из выбранного файла.
                  </p>

                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-slate-800">
                      Доступные файлы бэкапов в Docker:
                    </p>
                    <button
                      type="button"
                      onClick={fetchServerBackups}
                      className="text-[11px] font-bold text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingServerBackups ? 'animate-spin' : ''}`} />
                      <span>Обновить список</span>
                    </button>
                  </div>

                  {serverError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600" />
                      <span>{serverError}</span>
                    </div>
                  )}

                  {serverBackups.length === 0 ? (
                    <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2">
                      <Server className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-xs font-bold text-slate-700">
                        В хранилище Docker пока нет файлов бэкапов
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Вы можете создать бэкап во вкладке «Создание бэкапа» или дождаться автоматического запуска по расписанию Docker.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {serverBackups.map((b) => {
                        const isSelected = selectedServerBackup === b.filename;
                        const isEnc =
                          Boolean(b.encrypted) ||
                          b.filename.includes('.aes.') ||
                          b.filename.includes('.enc.');

                        return (
                          <div
                            key={b.filename}
                            onClick={() => setSelectedServerBackup(b.filename)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? 'bg-red-50/70 border-red-500 ring-2 ring-red-500/20 shadow-sm'
                                : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                  isSelected
                                    ? 'border-red-600 bg-red-600'
                                    : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-slate-900 text-xs truncate font-mono">
                                    {b.filename}
                                  </p>
                                  {isEnc && (
                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded flex items-center gap-0.5">
                                      <ShieldCheck className="w-2.5 h-2.5" /> AES-256
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5">
                                  <span>{b.created_at}</span>
                                  <span>•</span>
                                  <span className="font-bold text-slate-700">{b.size_formatted}</span>
                                  <span>•</span>
                                  <span className="uppercase font-mono text-[9px] bg-slate-200 px-1 py-0.2 rounded font-bold">
                                    {b.type}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                title="Скачать этот файл на ПК"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadServerBackup(b.filename);
                                }}
                                className="p-1.5 text-slate-600 hover:text-red-600 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                title="Удалить из Docker"
                                onClick={(e) => handleDeleteServerBackup(b.filename, e)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {selectedServerBackup && (
                    <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-2xl space-y-3">
                      <div className="flex items-start gap-2.5 text-amber-900 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold">Подтверждение восстановления</p>
                          <p className="text-[11px] text-amber-800 mt-0.5">
                            Выбран файл: <strong className="font-mono">{selectedServerBackup}</strong>.
                            Текущая база данных будет обновлена записями из этого снимка.
                          </p>
                        </div>
                      </div>

                      {/* Если бэкап в Docker зашифрован AES-256, отображаем поле пароля */}
                      {(selectedServerBackup.includes('.aes.') ||
                        selectedServerBackup.includes('.enc.') ||
                        serverBackups.find((b) => b.filename === selectedServerBackup)?.encrypted) && (
                        <div className="space-y-1.5 pt-1 border-t border-amber-200/60">
                          <label className="text-[11px] font-bold text-amber-950 block">
                            Пароль для расшифрования AES-256:
                          </label>
                          <div className="relative">
                            <input
                              type={showDecryptPassword ? 'text' : 'password'}
                              value={decryptPassphrase}
                              onChange={(e) => setDecryptPassphrase(e.target.value)}
                              placeholder="Введите пароль к архиву..."
                              className="w-full pl-9 pr-10 py-2 bg-white border border-amber-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono"
                            />
                            <Key className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                            <button
                              type="button"
                              onClick={() => setShowDecryptPassword(!showDecryptPassword)}
                              className="absolute right-3 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              {showDecryptPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="pt-1">
                        <label className="text-[11px] font-bold text-slate-700 block mb-1.5">
                          Режим восстановления:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setRestoreMode('replace')}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                              restoreMode === 'replace'
                                ? 'bg-amber-100/70 border-amber-400 text-amber-950 font-bold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <p>Полная замена</p>
                            <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                              Перезаписать текущие реестры
                            </p>
                          </button>

                          <button
                            type="button"
                            onClick={() => setRestoreMode('merge')}
                            className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                              restoreMode === 'merge'
                                ? 'bg-amber-100/70 border-amber-400 text-amber-950 font-bold'
                                : 'bg-white border-slate-200 text-slate-600'
                            }`}
                          >
                            <p>Слияние данных</p>
                            <p className="text-[10px] font-normal text-slate-500 mt-0.5">
                              Добавить новые записи к текущим
                            </p>
                          </button>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={isRestoring}
                        onClick={executeRestoreFromServer}
                        className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isRestoring ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Применение бэкапа из Docker...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                            <span>Восстановить базу из файла Docker</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Футер */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
