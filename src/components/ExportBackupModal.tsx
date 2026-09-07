import React, { useState, useRef } from 'react';
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
  Users
} from 'lucide-react';
import { Facility, Inspection, Equipment, Inspector, AuditLogEntry, BackupPayload } from '../types';
import {
  exportFacilitiesToCsv,
  exportInspectionsToCsv,
  exportEquipmentToCsv,
  exportAuditLogsToCsv,
  exportFullDatabaseBackup
} from '../utils/exportUtils';
import { createAuditEntry } from '../utils/auditUtils';

// Функция проверки прав администратора
const isUserAdmin = (user: any): boolean => {
  if (!user) return false;
  const role = String(user.role || '').trim().toLowerCase();
  const email = String(user.email || '').trim().toLowerCase();
  return (
    role === 'администратор' ||
    role === 'admin' ||
    role === 'administrator' ||
    role === 'админ' ||
    email === 'dbykov338@gmail.com' ||
    email === 'dbykov141@gmail.com' ||
    email.startsWith('admin') ||
    user.is_superuser === true ||
    user.is_admin === true
  );
};

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

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isAdmin = isUserAdmin(currentUser);

  if (!isOpen) return null;

  const handleExport = (type: 'facilities' | 'inspections' | 'equipment' | 'audit' | 'all') => {
    let entry: AuditLogEntry | undefined;

    if (type === 'facilities') {
      exportFacilitiesToCsv(facilities);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Реестр поднадзорных объектов',
        `Выгрузка в CSV (${facilities.length} записей)`
      );
      showToast?.('Реестр объектов успешно экспортирован в CSV');
    } else if (type === 'inspections') {
      exportInspectionsToCsv(inspections, facilities, inspectors);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Журнал проверок ГПН',
        `Выгрузка в CSV (${inspections.length} проверок)`
      );
      showToast?.('Журнал проверок успешно экспортирован в CSV');
    } else if (type === 'equipment') {
      exportEquipmentToCsv(equipment, facilities);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Реестр оборудования и СИЗ',
        `Выгрузка в CSV (${equipment.length} единиц)`
      );
      showToast?.('Реестр оборудования экспортирован в CSV');
    } else if (type === 'audit') {
      exportAuditLogsToCsv(auditLogs);
      entry = createAuditEntry(
        currentUser,
        'Экспорт отчета / Резервная копия',
        'Журнал аудита действий',
        `Выгрузка в CSV (${auditLogs.length} событий)`
      );
      showToast?.('Журнал аудита экспортирован в CSV');
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
        'Вся база данных (Full Backup)',
        `Создана резервная копия JSON: ${facilities.length} объектов, ${inspections.length} проверок`
      );
      showToast?.('Полная резервная копия базы данных (JSON) успешно сформирована');
    }

    if (entry && onAuditCreated) {
      onAuditCreated(entry);
    }
  };

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

  const executeRestore = () => {
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
        'Вся база данных (Бэкап)',
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

      showToast?.('База данных успешно восстановлена из резервной копии!');
      onClose();
    } catch (e: any) {
      setParseError(`Не удалось применить бэкап: ${e.message}`);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white flex items-center justify-between">
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
                <span className="text-xs text-slate-300 font-medium">Только для Администратора</span>
              </div>
              <h3 className="text-lg font-black text-white tracking-tight">
                Управление резервными копиями БД
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

        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3">
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
            <span>Выгрузка / Экспорт</span>
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
            <span>Загрузка из бэкапа (Restore)</span>
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {activeTab === 'export' ? (
            <>
              <p className="text-xs text-slate-600 leading-relaxed">
                Выберите необходимый формат выгрузки данных. Все файлы генерируются в кодировке{' '}
                <strong className="text-slate-900 font-bold">UTF-8 с сигнатурой BOM</strong>, что гарантирует
                корректное отображение русских символов в Microsoft Excel, LibreOffice и 1C.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => handleExport('facilities')}
                  className="p-3.5 bg-slate-50 hover:bg-red-50/50 border border-slate-200/80 hover:border-red-200 rounded-2xl text-left transition-all flex items-start gap-3 cursor-pointer group active:scale-[0.98]"
                >
                  <div className="p-2.5 bg-red-100 text-red-700 rounded-xl group-hover:bg-red-600 group-hover:text-white transition-colors shrink-0">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-slate-900">Реестр объектов</p>
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                        CSV
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {facilities.length} поднадзорных объектов
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('inspections')}
                  className="p-3.5 bg-slate-50 hover:bg-red-50/50 border border-slate-200/80 hover:border-red-200 rounded-2xl text-left transition-all flex items-start gap-3 cursor-pointer group active:scale-[0.98]"
                >
                  <div className="p-2.5 bg-red-100 text-red-700 rounded-xl group-hover:bg-red-600 group-hover:text-white transition-colors shrink-0">
                    <ClipboardCheck className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-slate-900">Журнал проверок</p>
                      <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded">
                        CSV
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {inspections.length} протоколов проверок
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('equipment')}
                  className="p-3.5 bg-slate-50 hover:bg-red-50/50 border border-slate-200/80 hover:border-red-200 rounded-2xl text-left transition-all flex items-start gap-3 cursor-pointer group active:scale-[0.98]"
                >
                  <div className="p-2.5 bg-amber-100 text-amber-700 rounded-xl group-hover:bg-amber-600 group-hover:text-white transition-colors shrink-0">
                    <Wrench className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-slate-900">Оборудование и СИЗ</p>
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                        CSV
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {equipment.length} учетных единиц
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleExport('audit')}
                  className="p-3.5 bg-slate-50 hover:bg-red-50/50 border border-slate-200/80 hover:border-red-200 rounded-2xl text-left transition-all flex items-start gap-3 cursor-pointer group active:scale-[0.98]"
                >
                  <div className="p-2.5 bg-purple-100 text-purple-700 rounded-xl group-hover:bg-purple-600 group-hover:text-white transition-colors shrink-0">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-xs text-slate-900">Журнал аудита</p>
                      <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded">
                        CSV
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                      {auditLogs.length} зафиксированных действий
                    </p>
                  </div>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => handleExport('all')}
                  className="w-full p-4 bg-gradient-to-r from-slate-900 to-slate-800 hover:from-slate-800 hover:to-slate-700 text-white rounded-2xl border border-slate-700 shadow-md transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3.5">
                    <div className="p-3 bg-red-600 text-white rounded-xl shadow-md group-hover:scale-105 transition-transform">
                      <Database className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <p className="text-xs font-black tracking-tight text-white flex items-center gap-1.5">
                        <span>Полная резервная копия БД</span>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/30 text-red-300">
                          JSON
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Снимок всех реестров, сотрудников, проверок и логов аудита
                      </p>
                    </div>
                  </div>
                  <Download className="w-5 h-5 text-red-400 group-hover:translate-y-0.5 transition-transform" />
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Загрузите ранее созданный JSON-файл резервной копии базы данных{' '}
                <strong className="text-slate-900 font-bold">«ПожНадзор.pro»</strong>. Система проверит целостность
                структуры и восстановит записи реестров и проверок.
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
                      {selectedFile ? selectedFile.name : 'Нажмите для выбора файла или перетащите его сюда'}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Поддерживаются файлы резервных копий .JSON
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
                      <span>Анализ содержимого бэкапа:</span>
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
                      Режим восстановления данных:
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
                    onClick={executeRestore}
                    className="w-full mt-2 py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isRestoring ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Восстановление базы данных...</span>
                      </>
                    ) : (
                      <>
                        <RotateCcw className="w-4 h-4 stroke-[2.5]" />
                        <span>Применить восстановление из бэкапа</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
};
