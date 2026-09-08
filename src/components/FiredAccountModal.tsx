import React from 'react';
import { ShieldAlert, LogOut, UserX, AlertOctagon } from 'lucide-react';
import { Inspector } from '../types';

interface FiredAccountModalProps {
  isOpen: boolean;
  user: Inspector | null;
  onConfirmLogout: () => void;
}

export const FiredAccountModal: React.FC<FiredAccountModalProps> = ({
  isOpen,
  user,
  onConfirmLogout
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border-2 border-red-200 overflow-hidden text-center p-8 space-y-6 relative animate-scaleUp">
        {/* Аватарка / иконка блокировки */}
        <div className="relative mx-auto w-24 h-24">
          <div className="w-24 h-24 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center border-2 border-red-200 shadow-inner">
            <UserX className="w-12 h-12 stroke-[2.2]" />
          </div>
          <div className="absolute -bottom-2 -right-2 bg-red-600 text-white p-2 rounded-2xl shadow-lg border-2 border-white">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>

        {/* Заголовок и статус */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-red-100 text-red-800 border border-red-200">
            <ShieldAlert className="w-3.5 h-3.5" />
            Доступ аннулирован
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Служебный доступ заблокирован
          </h2>
          <p className="text-sm font-semibold text-red-600">
            Вы были уволены или исключены из реестра сотрудников ГПН
          </p>
        </div>

        {/* Карточка пользователя */}
        {user && (
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left space-y-1.5">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider">
              Учетная запись:
            </div>
            <div className="font-bold text-slate-800 text-base">{user.full_name}</div>
            <div className="text-xs text-slate-600 flex items-center justify-between">
              <span>{user.rank}</span>
              <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200">{user.email}</span>
            </div>
          </div>
        )}

        {/* Разъяснение */}
        <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
          Администратор безопасности аннулировал ваши права и учетную запись в единой автоматизированной системе «ПожНадзор.pro». Все активные сессии отозваны в соответствии с приказом МЧС России.
        </p>

        {/* Действие */}
        <div className="pt-2">
          <button
            type="button"
            onClick={onConfirmLogout}
            className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold text-sm shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 cursor-pointer transition-all transform active:scale-95"
          >
            <LogOut className="w-4 h-4" />
            Выйти на экран авторизации
          </button>
        </div>
      </div>
    </div>
  );
};
