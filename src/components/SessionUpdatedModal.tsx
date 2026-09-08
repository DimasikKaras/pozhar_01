import React from 'react';
import { ShieldAlert, LogOut, KeyRound, Info } from 'lucide-react';

interface SessionUpdatedModalProps {
  isOpen: boolean;
  userName: string;
  onConfirm: () => void;
}

export const SessionUpdatedModal: React.FC<SessionUpdatedModalProps> = ({
  isOpen,
  userName,
  onConfirm
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="session-updated-modal-backdrop"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="session-updated-modal-card"
        className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 overflow-hidden text-center p-6 sm:p-8 space-y-5 relative animate-scaleUp"
      >
        {/* Верхняя иконка безопасности */}
        <div className="relative mx-auto w-20 h-20">
          <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-3xl flex items-center justify-center border border-amber-200 shadow-inner">
            <ShieldAlert className="w-10 h-10 stroke-[2.2]" />
          </div>
          <div className="absolute -bottom-1 -right-1 bg-amber-500 text-white p-1.5 rounded-xl shadow-md border-2 border-white">
            <KeyRound className="w-4 h-4" />
          </div>
        </div>

        {/* Заголовок и статус */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-200">
            <Info className="w-3.5 h-3.5" />
            Безопасность сессии
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Данные учетной записи обновлены
          </h2>
          <p className="text-sm font-semibold text-slate-700">
            Требуется повторный вход в систему
          </p>
        </div>

        {/* Карточка сотрудника */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left space-y-1.5">
          <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Сотрудник:
          </div>
          <div className="font-bold text-slate-900 text-base">
            {userName || 'Сотрудник службы ГПН'}
          </div>
          <div className="text-xs text-slate-500">
            Параметры профиля (ФИО, специальное звание или роль доступа) были изменены администратором.
          </div>
        </div>

        {/* Корректное разъяснение и просьба войти заново */}
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-md mx-auto text-left sm:text-center">
          В соответствии с регламентом информационной безопасности ГПН МЧС России, для вступления новых прав доступа и данных в силу текущая служебная сессия была корректно завершена.
        </p>

        <div className="bg-amber-50/70 border border-amber-200/80 rounded-2xl p-3 text-xs text-amber-800 text-left flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <span>
            Пожалуйста, выполните повторный вход в личный кабинет «ПожНадзор.pro», используя актуальные учетные данные.
          </span>
        </div>

        {/* Кнопка перехода к авторизации */}
        <div className="pt-2">
          <button
            id="session-updated-confirm-btn"
            type="button"
            onClick={onConfirm}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-bold text-sm shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all transform active:scale-98"
          >
            <LogOut className="w-4 h-4" />
            Понятно, войти в систему
          </button>
        </div>
      </div>
    </div>
  );
};
