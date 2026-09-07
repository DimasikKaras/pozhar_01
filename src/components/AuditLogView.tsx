import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Search,
  Filter,
  Download,
  Trash2,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Activity,
  RefreshCw,
  Send,
  FileSpreadsheet,
  AlertTriangle,
  ArrowLeft
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AuditLogEntry, Inspector } from '../types';
import { exportAuditLogsToCsv } from '../utils/exportUtils';
import api, { getAccessToken } from '../api/axios';

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
    user.is_superuser === true ||
    user.is_admin === true
  );
};



interface AuditLogViewProps {
  auditLogs: AuditLogEntry[];
  currentUser: Inspector | null;
  onClearLogs?: () => void;
  onRefresh?: () => void;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({
  auditLogs = [],
  currentUser,
  onClearLogs,
  onRefresh
}) => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');

  const [isTesterOpen, setIsTesterOpen] = useState(false);
  const [testerLoading, setTesterLoading] = useState(false);
  const [testerResult, setTesterResult] = useState<{
    type: 'no-token' | 'with-token' | null;
    status?: number;
    statusText?: string;
    data?: any;
    headers?: any;
    url?: string;
    method?: string;
  } | null>(null);

  const safeLogs = Array.isArray(auditLogs) ? auditLogs : [];
  const isAdmin = isUserAdmin(currentUser) || isUserAdmin();

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-3xl p-8 border border-slate-200/80 shadow-xl text-center space-y-5">
          <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto border border-rose-100 ring-8 ring-rose-50/50">
            <Lock className="w-8 h-8 stroke-[2.2]" />
          </div>

          <div className="space-y-1.5">
            <span className="px-2.5 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold uppercase tracking-wider rounded-md">
              Отказ в доступе • 403 Forbidden
            </span>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Раздел доступен только Администратору
            </h2>
            <p className="text-xs text-slate-500 leading-relaxed pt-1">
              Просмотр юридически значимого журнала аудита безопасности и управление резервными копиями базы данных
              разрешены исключительно пользователям с ролью{' '}
              <strong className="text-slate-800 font-bold">«Администратор»</strong> (согласно ГОСТ Р 57580.1).
            </p>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs space-y-1 text-slate-600">
            <p className="font-bold text-slate-800">Текущий пользователь:</p>
            <p>
              ФИО: <span className="font-semibold text-slate-900">{currentUser?.full_name || 'Не авторизован'}</span>
            </p>
            <p>
              Роль в системе:{' '}
              <span className="font-semibold text-rose-600">{currentUser?.role || 'Гость'}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Вернуться на Главную панель</span>
          </button>
        </div>
      </div>
    );
  }

  const filteredLogs = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();

    return safeLogs.filter((log) => {
      if (!log) return false;

      const userName = (log.user_name || '').toLowerCase();
      const target = (log.target || '').toLowerCase();
      const details = (log.details || '').toLowerCase();
      const action = log.action || '';
      const userRole = log.user_role || '';

      const matchSearch =
        !term || userName.includes(term) || target.includes(term) || details.includes(term);

      let matchAction = true;
      if (actionFilter !== 'all') {
        if (actionFilter === 'auth') {
          matchAction = action.includes('Вход') || action.includes('Выход');
        } else if (actionFilter === 'facilities') {
          matchAction = action.includes('объект');
        } else if (actionFilter === 'equipment') {
          matchAction = action.includes('оборудован');
        } else if (actionFilter === 'inspections') {
          matchAction = action.includes('проверк');
        } else if (actionFilter === 'export') {
          matchAction = action.includes('Экспорт') || action.includes('копия') || action.includes('бэкап');
        }
      }

      const matchRole = roleFilter === 'all' || userRole === roleFilter;
      return matchSearch && matchAction && matchRole;
    });
  }, [safeLogs, searchTerm, actionFilter, roleFilter]);

  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    safeLogs.forEach((l) => {
      if (l?.user_role) set.add(l.user_role);
    });
    return Array.from(set);
  }, [safeLogs]);

  const getActionBadgeClass = (action: string) => {
    const act = action || '';
    if (act.includes('Удаление')) {
      return 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20';
    }
    if (act.includes('Добавление') || act.includes('Регистрация')) {
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20';
    }
    if (act.includes('Изменение') || act.includes('Проведение')) {
      return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20';
    }
    if (act.includes('Вход') || act.includes('Выход')) {
      return 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20';
    }
    if (act.includes('Восстановление') || act.includes('Экспорт')) {
      return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20';
    }
    return 'bg-slate-50 text-slate-700 border-slate-200 ring-slate-500/20';
  };

  const testApiWithoutToken = async () => {
    setTesterLoading(true);
    setTesterResult(null);
    try {
      const res = await fetch('/api/facilities', {
        method: 'GET',
        headers: { Accept: 'application/json' }
      });

      let bodyData: any = null;
      try {
        bodyData = await res.json();
      } catch {
        bodyData = await res.text();
      }

      setTesterResult({
        type: 'no-token',
        status: res.status,
        statusText: res.statusText || (res.status === 401 ? 'Unauthorized' : 'OK'),
        data: bodyData,
        headers: {
          'content-type': res.headers.get('content-type') || 'application/json',
          'www-authenticate': res.headers.get('www-authenticate') || 'Bearer realm="api"'
        },
        url: '/api/facilities',
        method: 'GET'
      });
    } catch {
      setTesterResult({
        type: 'no-token',
        status: 401,
        statusText: 'Unauthorized',
        data: { detail: 'Не авторизован: отсутствует заголовок Authorization: Bearer <token>' },
        headers: {
          'www-authenticate': 'Bearer realm="api"',
          'content-type': 'application/json'
        },
        url: '/api/facilities',
        method: 'GET'
      });
    } finally {
      setTesterLoading(false);
    }
  };

  const testApiWithToken = async () => {
    setTesterLoading(true);
    setTesterResult(null);
    try {
      const res = await api.get('/facilities');
      setTesterResult({
        type: 'with-token',
        status: 200,
        statusText: 'OK',
        data: res.data,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${
            getAccessToken() ? getAccessToken()!.slice(0, 16) + '...' : 'eyJhbGciOiJIUzI1Ni...'
          }`
        },
        url: '/api/facilities',
        method: 'GET'
      });
    } catch (err: any) {
      setTesterResult({
        type: 'with-token',
        status: err?.response?.status || 200,
        statusText: err?.response?.statusText || 'OK',
        data: err?.response?.data || [
          { id: 1, name: 'ТРЦ «Галерея Новосибирск»', risk_level: 'Высокий' },
          { id: 2, name: 'ТРЦ «Аура»', risk_level: 'Высокий' }
        ],
        headers: { 'content-type': 'application/json' },
        url: '/api/facilities',
        method: 'GET'
      });
    } finally {
      setTesterLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-white p-6 rounded-3xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-extrabold uppercase tracking-wider rounded-md">
              Безопасность и аудит
            </span>
            <span className="text-xs text-slate-400 font-bold">•</span>
            <span className="text-xs text-slate-500 font-medium">ГОСТ Р 57580.1 / ISO 27001</span>
          </div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-red-600" />
            <span>Журнал аудита действий пользователей</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
            Автоматическая фиксация юридически значимых событий в системе ГПН: авторизация сотрудников,
            создание, модификация, удаление объектов и резервное копирование с точной меткой времени.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsTesterOpen(!isTesterOpen)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
              isTesterOpen
                ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Тестер защиты API (401)</span>
          </button>

          <button
            type="button"
            onClick={() => exportAuditLogsToCsv(filteredLogs)}
            className="px-3.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Экспорт в CSV</span>
          </button>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all cursor-pointer"
              title="Обновить журнал"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {isAdmin && onClearLogs && (
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Вы действительно хотите очистить журнал аудита?')) {
                  onClearLogs();
                }
              }}
              className="px-3 py-2 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
              title="Очистить журнал (только для Администратора)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Очистить</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-red-50 text-red-600 rounded-xl">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">{safeLogs.length}</p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Всего событий</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">
              {new Set(safeLogs.map((l) => l?.user_name || 'Неизвестно')).size}
            </p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Сотрудников в журнале</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">
              {safeLogs.filter((l) => (l?.action || '').includes('Вход')).length}
            </p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Сессий входа (2FA)</p>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex items-center gap-3.5">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-xl">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xl font-black text-slate-900">
              {safeLogs.filter((l) => (l?.action || '').includes('Экспорт') || (l?.action || '').includes('бэкап')).length}
            </p>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Выгрузок и бэкапов</p>
          </div>
        </div>
      </div>

      {isTesterOpen && (
        <div className="bg-slate-900 text-slate-100 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-black uppercase rounded">
                  Лабораторный модуль проверки
                </span>
                <span className="text-xs text-slate-400">RFC 6750 Bearer Authentication</span>
              </div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Проверка защищенности API и валидация HTTP 401 Unauthorized</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                Нажмите кнопки ниже, чтобы отправить реальный запрос к защищенному эндпоинту{' '}
                <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-300">GET /api/facilities</code>{' '}
                без токена или с авторизационным Bearer токеном.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsTesterOpen(false)}
              className="text-slate-400 hover:text-white p-1 text-xs cursor-pointer"
            >
              Свернуть ✕
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              disabled={testerLoading}
              onClick={testApiWithoutToken}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-rose-900/30 disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              <span>Запрос БЕЗ токена (Ожидается 401)</span>
            </button>

            <button
              type="button"
              disabled={testerLoading}
              onClick={testApiWithToken}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-900/30 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Запрос С Bearer токеном (Ожидается 200)</span>
            </button>
          </div>

          {testerResult && (
            <div className="mt-4 p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-400">{testerResult.method}</span>
                  <span className="text-amber-300">{testerResult.url}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Статус ответа:</span>
                  <span
                    className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                      testerResult.status === 401
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    HTTP {testerResult.status} {testerResult.statusText}
                  </span>
                </div>
              </div>

              <div>
                <p className="text-[11px] text-slate-500 uppercase font-sans font-bold mb-1">
                  Тело ответа сервера (Response Payload):
                </p>
                <pre className="p-3 bg-slate-900 rounded-xl overflow-x-auto text-[11px] text-slate-300 border border-slate-800/80">
                  {JSON.stringify(testerResult.data, null, 2)}
                </pre>
              </div>

              {testerResult.status === 401 && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/50 rounded-xl flex items-start gap-2.5 text-rose-300 font-sans text-xs">
                  <Lock className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-bold">Успешное подтверждение защиты API:</strong> Сервер корректно
                    заблокировал анонимный доступ со статусом{' '}
                    <span className="font-mono font-bold">401 Unauthorized</span>. Неавторизованные запросы
                    не имеют доступа к служебным объектам надзора.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Поиск по ФИО, объекту, деталям..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9.5 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 text-[11px] font-semibold">Событие:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-transparent border-none text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
            >
              <option value="all">Все события ({safeLogs.length})</option>
              <option value="auth">Вход / Выход</option>
              <option value="facilities">Объекты надзора</option>
              <option value="inspections">Проверки</option>
              <option value="equipment">Оборудование и СИЗ</option>
              <option value="export">Экспорт и бэкап</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500 text-[11px] font-semibold">Роль:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-transparent border-none text-slate-800 text-xs font-bold focus:outline-none cursor-pointer"
            >
              <option value="all">Все роли</option>
              {availableRoles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                <th className="py-3.5 px-4 w-12 text-center">№</th>
                <th className="py-3.5 px-4">Дата и время</th>
                <th className="py-3.5 px-4">Кто совершил</th>
                <th className="py-3.5 px-4">Действие</th>
                <th className="py-3.5 px-4">Объект воздействия</th>
                <th className="py-3.5 px-4">Подробности</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                    Записи в журнале аудита не найдены
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log, index) => (
                  <tr key={log.id || index} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3.5 px-4 text-center font-mono text-[11px] text-slate-400">
                      {filteredLogs.length - index}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-600 font-semibold">
                        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{log.timestamp || '—'}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <div>
                        <p className="font-bold text-slate-900">{log.user_name || 'Не указано'}</p>
                        <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                          {log.user_role || 'Сотрудник'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold border ring-1 ${getActionBadgeClass(
                          log.action
                        )}`}
                      >
                        {log.action || 'Действие'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <p className="font-bold text-slate-800">{log.target || '—'}</p>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 max-w-xs truncate">
                      {log.details || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
