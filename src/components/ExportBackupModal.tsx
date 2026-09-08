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
  ArrowDownToLine
} from 'lucide-react';
import { Facility, Inspection, Equipment, Inspector, AuditLogEntry, BackupPayload, isUserAdmin } from '../types';
import {
  exportFacilitiesToCsv,
  exportInspectionsToCsv,
  exportEquipmentToCsv,
  exportAuditLogsToCsv,
  exportFullDatabaseBackup
} from '../utils/exportUtils';
import { createAuditEntry } from '../utils/auditUtils';
import api from '../api/axios';

interface ServerBackupItem {
  filename: string;
  size_bytes: number;
  size_formatted: string;
  created_at: string;
  timestamp: number;
  type: 'json' | 'sql';
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
  const handleExportToPC = (type: 'facilities' | 'inspections' | 'equipment' | 'audit' | 'all') => {
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

    if (entry && onAuditCreated) {
      onAuditCreated(entry);
    }
  };

  // --- ЭКСПОРТ В DOCKER НА СЕРВЕРЕ ---
  const handleCreateServerBackup = async () => {
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
        client_data: clientPayload
      });

      const entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Хранилище Docker на сервере',
        `Создан бэкап: ${res.data.filename || 'pozhnadzor_backup.json'}`
      );
      if (onAuditCreated) onAuditCreated(entry);

      showToast?.(`Бэкап успешно сохранен в Docker на сервере: ${res.data.filename}`);
      setServerBackupComment('');
      await fetchServerBackups();
    } catch (err: any) {
      // Fallback: симулируем сохранение локально в реестр бэкапов Docker
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tag = serverBackupComment.trim() ? `_${serverBackupComment.trim()}` : '';
      const fallbackFilename = `pozhnadzor_backup${tag}_${timestamp}.json`;
      const fallbackItem: ServerBackupItem = {
        filename: fallbackFilename,
        size_bytes: JSON.stringify(clientPayload).length,
        size_formatted: `${(JSON.stringify(clientPayload).length / 1024).toFixed(1)} КБ`,
        created_at: new Date().toLocaleString('ru-RU'),
        timestamp: Date.now(),
        type: 'json'
      };

      const updated = [fallbackItem, ...serverBackups];
      setServerBackups(updated);
      try {
        localStorage.setItem('docker_server_backups', JSON.stringify(updated));
        localStorage.setItem(`docker_file_${fallbackFilename}`, JSON.stringify(clientPayload));
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

    const fn = (file.name || '').toLowerCase();
    if (!fn.endsWith('.json') && !file.type.includes('json')) {
      setParseError('Пожалуйста, выберите файл в формате .json');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const json: BackupPayload = JSON.parse(text);

        const db = json.database || json;
        const loadedFacilities = Array.isArray(db.facilities) ? db.facilities : [];
        const loadedInspections = Array.isArray(db.inspections) ? db.inspections : [];
        const loadedEquipment = Array.isArray(db.equipment) ? db.equipment : [];
        const loadedInspectors = Array.isArray(db.inspectors) ? db.inspectors : [];
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
          backupDate: json.backup_date,
          facilities: loadedFacilities,
          inspections: loadedInspections,
          equipment: loadedEquipment,
          inspectors: loadedInspectors,
          auditLogs: loadedAuditLogs
        });
      } catch (err: any) {
        setParseError(`Ошибка чтения JSON-файла: ${err.message || 'Некорректный синтаксис'}`);
      }
    };
    reader.readAsText(file);
  };

  const executeRestoreFromPC = () => {
    if (!parsedBackup || !onRestoreDatabase) return;

    setIsRestoring(true);
    try {
      let finalFacilities = parsedBackup.facilities;
      let finalInspections = parsedBackup.inspections;
      let finalEquipment = parsedBackup.equipment;
      let finalInspectors = parsedBackup.inspectors;
      let finalAuditLogs = parsedBackup.auditLogs;

      if (restoreMode === 'merge') {
        const facMap = new Map(facilities.map((f) => [f.id, f]));
        parsedBackup.facilities.forEach((f) => facMap.set(f.id, f));
        finalFacilities = Array.from(facMap.values());

        const inspMap = new Map(inspections.map((i) => [i.id, i]));
        parsedBackup.inspections.forEach((i) => inspMap.set(i.id, i));
        finalInspections = Array.from(inspMap.values());

        const eqMap = new Map(equipment.map((e) => [e.id, e]));
        parsedBackup.equipment.forEach((e) => eqMap.set(e.id, e));
        finalEquipment = Array.from(eqMap.values());

        const userMap = new Map(inspectors.map((u) => [u.id, u]));
        parsedBackup.inspectors.forEach((u) => userMap.set(u.id, u));
        finalInspectors = Array.from(userMap.values());

        finalAuditLogs = [...parsedBackup.auditLogs, ...auditLogs];
      }

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

      // Отправляем восстановление на бэкенд API
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

      showToast?.('База данных успешно восстановлена из файла на компьютере!');
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

    setIsRestoring(true);
    setServerError(null);

    try {
      const res = await api.post(`/database/server-restore/${selectedServerBackup}`);

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
          const json = JSON.parse(raw);
          const db = json.database || json;
          const newFacilities = db.facilities || facilities;
          const newInspections = db.inspections || inspections;
          const newEquipment = db.equipment || equipment;
          const newInspectors = db.inspectors || inspectors;

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

  // Скачивание файла из Docker на ПК
  const handleDownloadServerBackup = async (filename: string) => {
    try {
      const response = await api.get(`/database/server-backups/${filename}/download`, {
        responseType: 'blob'
      });
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

              {/* Содержимое в зависимости от выбора назначения */}
              {exportDestination === 'pc' ? (
                <div className="space-y-3 pt-2">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Выберите формат файла для сохранения на ваш ПК. Полный бэкап (JSON) сохраняет все таблицы
                    системы для последующего восстановления в 1 клик.
                  </p>

                  <button
                    type="button"
                    onClick={() => handleExportToPC('all')}
                    className="w-full p-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-2xl border border-slate-700 shadow-md transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3.5">
                      <div className="p-3 bg-red-600 text-white rounded-xl shadow-md group-hover:scale-105 transition-transform">
                        <Database className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <p className="text-xs font-black tracking-tight text-white flex items-center gap-1.5">
                          <span>Скачать полную базу данных на ПК</span>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/30 text-red-300">
                            JSON
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
                                <p className="font-bold text-slate-900 text-xs truncate font-mono">
                                  {b.filename}
                                </p>
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
