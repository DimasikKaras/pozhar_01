import Toast from "./components/Toast";
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Routes,
  Route,
  Link,
  NavLink,
  useNavigate,
  useLocation,
  Navigate
} from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  ClipboardCheck,
  Users,
  Wrench,
  UserCheck,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Search,
  Filter,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Flame,
  X,
  Check,
  ChevronRight,
  MapPin,
  FileText,
  Phone,
  Mail,
  ShieldAlert,
  SlidersHorizontal,
  RefreshCw,
  Eye,
  Info,
  Menu,
  KeyRound,
  Lock,
  Smartphone,
  ShieldCheck,
  Hash,
  Send,
  EyeOff,
  QrCode,
  Copy,
  Download,
  Database,
  Sparkles,
  Key,
  Timer,
  CheckCheck,
  ExternalLink,
  HelpCircle,
  Fingerprint,
  Settings,
  Inbox
} from 'lucide-react';
import {
  generateBase32Secret,
  generateTOTPCode,
  verifyTOTPCode,
  generateOtpAuthUrl,
  generateQrCodeDataUrl,
  generateQrCodeSvg,
  generateBackupRecoveryCodes,
  getRemainingTOTPSeconds,
  getDeterministicInspectorSecret,
  downloadBackupCodesAsTxt,
  formatSecretForDisplay,
  sanitizeBase32
} from './utils/totp';

import {
  sendEmail2FACode,
  verifyEmail2FACode,
  checkSmtpStatus,
  EmailDeliveryResult,
  SmtpStatus
} from './utils/email2fa';

import { Email2FAInboxModal } from './components/Email2FAInboxModal';
import { AuditLogView } from './components/AuditLogView';
import { ExportBackupModal } from './components/ExportBackupModal';
import { loadAuditLogs, saveAuditLogs, createAuditEntry } from './utils/auditUtils';
import { AuditLogEntry, AuditActionType } from './types';

import {
  Facility,
  Inspector,
  Equipment,
  Inspection,
  RiskLevel,
  EquipmentStatus,
  InspectionResult,
  Role
} from './types';
import {
  INITIAL_FACILITIES,
  INITIAL_INSPECTORS,
  INITIAL_EQUIPMENT,
  INITIAL_INSPECTIONS
} from './data/initialData';
import api, { setAccessToken } from './api/axios';

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



const RISK_LEVELS: RiskLevel[] = ['Высокий', 'Значительный', 'Средний', 'Умеренный', 'Низкий'];
const EQUIPMENT_STATUSES: EquipmentStatus[] = ['Исправен', 'Требует ремонта', 'Списан', 'На проверке'];
const INSPECTION_RESULTS: InspectionResult[] = ['Пройдена', 'Не пройдена'];

// Secret Master Passcodes for Stealth Administrator Registration
export const VALID_ADMIN_MASTER_KEYS = ['MCHS-ADMIN-2026', 'ADM-7700', 'ADMIN2026', 'MCHS-SUPER-ADMIN'];

// Helper for status badge styling
export const getRiskBadge = (level: RiskLevel) => {
  switch (level) {
    case 'Высокий':
      return 'bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20';
    case 'Значительный':
      return 'bg-orange-50 text-orange-700 border-orange-200 ring-orange-500/20';
    case 'Средний':
      return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20';
    case 'Умеренный':
      return 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-500/20';
    case 'Низкий':
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20';
  }
};

export const getEquipmentStatusBadge = (status: EquipmentStatus) => {
  switch (status) {
    case 'Исправен':
      return {
        bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        icon: CheckCircle2,
        dot: 'bg-emerald-500'
      };
    case 'Требует ремонта':
      return {
        bg: 'bg-amber-50 text-amber-700 border-amber-200',
        icon: AlertTriangle,
        dot: 'bg-amber-500'
      };
    case 'Списан':
      return {
        bg: 'bg-slate-100 text-slate-700 border-slate-300',
        icon: XCircle,
        dot: 'bg-slate-500'
      };
    case 'На проверке':
    default:
      return {
        bg: 'bg-sky-50 text-sky-700 border-sky-200',
        icon: Clock,
        dot: 'bg-sky-500'
      };
  }
};

// Helper for phone validation and formatting
export const isValidRussianPhone = (phoneStr: string) => {
  const digits = phoneStr.replace(/\D/g, '');
  return digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'));
};

export const normalizePhoneNumber = (phoneStr: string) => {
  const digits = phoneStr.replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return phoneStr;
};

// Date validation helpers: prevent future dates
export const getTodayDateString = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const isFutureDate = (dateStr?: string): boolean => {
  if (!dateStr) return false;
  const today = getTodayDateString();
  return dateStr > today;
};

// Clean sequential ID generator (avoids huge timestamp numbers like 176722019237)
export const getNextSequentialId = (items: { id?: number }[]): number => {
  if (!items || items.length === 0) return 1;
  const validIds = items
    .map((item) => Number(item.id))
    .filter((id) => !isNaN(id) && id > 0 && id < 100000);
  if (validIds.length === 0) return items.length + 1;
  return Math.max(...validIds) + 1;
};

// Sanitize legacy exorbitantly high IDs from past testing
export const sanitizeLegacyIds = <T extends { id: number }>(items: T[]): T[] => {
  let counter = 1;
  items.forEach((item) => {
    if (item.id && item.id < 100000) {
      counter = Math.max(counter, item.id + 1);
    }
  });
  return items.map((item) => {
    if (!item.id || item.id >= 100000) {
      const newId = counter++;
      return { ...item, id: newId };
    }
    return item;
  });
};

// --- AUTH PAGE COMPONENT WITH REAL RFC 6238 TOTP TWO-FACTOR AUTHENTICATION ---
function AuthScreen({
  onLogin,
  existingInspectors
}: {
  onLogin: (user: Inspector) => void;
  existingInspectors: Inspector[];
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rank, setRank] = useState('Лейтенант внутренней службы');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<Role>('Инспектор');
  const [adminSecretCode, setAdminSecretCode] = useState('');
  const [showSecretField, setShowSecretField] = useState(false);
  const [masterKeyAttempts, setMasterKeyAttempts] = useState<number>(0);
  const [masterKeyLockoutSeconds, setMasterKeyLockoutSeconds] = useState<number>(0);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // 2FA Registration Choice
  const [register2FAMethod, setRegister2FAMethod] = useState<'totp' | 'email'>('totp');

  // 2FA Verification Flow State (during Login)
  const [twoFactorPendingUser, setTwoFactorPendingUser] = useState<Inspector | null>(null);
  const [twoFactorTab, setTwoFactorTab] = useState<'totp' | 'email' | 'backup'>('totp');
  const [twoFactorInputCode, setTwoFactorInputCode] = useState<string>('');
  const [emailExpectedCode, setEmailExpectedCode] = useState<string>('');
  const [emailCooldown, setEmailCooldown] = useState<number>(60);
  const [copiedKey, setCopiedKey] = useState<boolean>(false);
  const [copiedCodes, setCopiedCodes] = useState<boolean>(false);

  // Real Email 2FA Delivery & SMTP State
  const [emailDeliveryResult, setEmailDeliveryResult] = useState<EmailDeliveryResult | null>(null);
  const [sendingEmail, setSendingEmail] = useState<boolean>(false);
  const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
  
  // Real-time TOTP ticker state
  const [remainingSeconds, setRemainingSeconds] = useState<number>(getRemainingTOTPSeconds());
  
  // Failed attempt protection
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutTimer, setLockoutTimer] = useState<number>(0);

  // Registration 2FA Setup Flow State
  const [setup2FAUser, setSetup2FAUser] = useState<Inspector | null>(null);
  const [setupSecret, setSetupSecret] = useState<string>('');
  const [setupBackupCodes, setSetupBackupCodes] = useState<string[]>([]);
  const [setupQrUrl, setSetupQrUrl] = useState<string>('');
  const [setupOtpUrl, setSetupOtpUrl] = useState<string>('');
  const [setupInputCode, setSetupInputCode] = useState<string>('');

  // 1-second interval ticker for TOTP time window and cooldown timers
  useEffect(() => {
    const timer = setInterval(() => {
      const sec = getRemainingTOTPSeconds();
      setRemainingSeconds(sec);

      setEmailCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setLockoutTimer((prev) => (prev > 0 ? prev - 1 : 0));
      setMasterKeyLockoutSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Check SMTP server status on mount
  useEffect(() => {
    checkSmtpStatus().then((st) => setSmtpStatus(st));
  }, []);

  // Email format regex validation
    // Validation Helpers: Russian full name (Фамилия Имя Отчество)
  const isValidFullName = (name: string) => {
    const trimmed = name.trim();
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return false;
    const nameRegex = /^[А-ЯЁа-яёA-Za-z\s-]+$/;
    return nameRegex.test(trimmed) && parts.every((p) => p.length >= 2);
  };

  // Validation Helpers: Strong Password (>= 8 chars, 1 letter, 1 number, 1 special char)
  const isValidStrongPassword = (pwd: string) => {
    if (pwd.length < 8) return false;
    const hasLetter = /[a-zA-Zа-яА-ЯёЁ]/.test(pwd);
    const hasDigit = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?~`]/.test(pwd);
    return hasLetter && hasDigit && hasSpecial;
  };

  const isValidEmail = (val: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
  };

  // Helper to issue real Email OTP code
  const issueEmailOtpCode = async (user: Inspector) => {
    setSendingEmail(true);
    setEmailCooldown(60);
    try {
      const result = await sendEmail2FACode(user.email, user.full_name);
      setEmailDeliveryResult(result);
      if (result.deliveryDetails?.code) {
        setEmailExpectedCode(result.deliveryDetails.code);
      }
      if (result.sentRealMail) {
        setSuccessMessage(`Код успешно отправлен на вашу почту ${user.email}`);
      }
    } catch (err: any) {
      console.error('Failed to issue email OTP code:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCopySecret = (secret: string) => {
    navigator.clipboard.writeText(secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyBackupCodes = (codes: string[]) => {
    navigator.clipboard.writeText(codes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  // Initial Form Submit (Login / Register Initiation)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    const trimmedEmail = email.trim();

    if (!isValidEmail(trimmedEmail)) {
      setError('Пожалуйста, введите корректный адрес электронной почты (например, inspector@mchs.gov.ru)');
      return;
    }

    if (mode === 'register') {
      if (!isValidFullName(fullName)) {
        setError('Пожалуйста, укажите корректное ФИО инспектора (минимум Фамилия и Имя, например: Иванов Иван Иванович)');
        return;
      }
      if (!isValidStrongPassword(password)) {
        setError('Пароль не отвечает требованиям безопасности: минимум 8 символов, хотя бы одна буква, одна цифра и один специальный символ (!@#$%^&*).');
        return;
      }

      const trimmedPhone = phone.trim();
      if (trimmedPhone && !isValidRussianPhone(trimmedPhone)) {
        setError('Пожалуйста, введите корректный номер телефона РФ (например: +7 (999) 123-45-67)');
        return;
      }

      const isDuplicate = existingInspectors.some(
        (insp) => insp.email.trim().toLowerCase() === trimmedEmail.toLowerCase()
      );

      if (isDuplicate) {
        setError(`Аккаунт с почтой "${trimmedEmail}" уже существует в системе. Выберите вкладку "Вход в систему".`);
        return;
      }

      // Secure Master Key validation for Administrator role
      let assignedRole: Role = role;
      const trimmedCode = adminSecretCode.trim().toUpperCase();

      if (role === 'Администратор' || trimmedCode.length > 0) {
        if (masterKeyLockoutSeconds > 0) {
          setError(`Превышено количество попыток ввода служебного кода. Повторите попытку через ${masterKeyLockoutSeconds} сек.`);
          return;
        }

        const isMasterKeyValid = VALID_ADMIN_MASTER_KEYS.includes(trimmedCode);
        if (!isMasterKeyValid) {
          const nextAttempts = masterKeyAttempts + 1;
          setMasterKeyAttempts(nextAttempts);
          if (nextAttempts >= 3) {
            setMasterKeyLockoutSeconds(30);
            setMasterKeyAttempts(0);
            setError('Превышено количество попыток. Ввод служебного кода заблокирован на 30 секунд.');
          } else {
            setError(`Ошибка допуска: недействительный служебный код (осталось попыток: ${3 - nextAttempts}).`);
          }
          return;
        }

        assignedRole = 'Администратор';
        setMasterKeyAttempts(0);
      }

      // Generate standard RFC 6238 32-char Base32 2FA Credentials for Setup Wizard
      const newSecret = generateBase32Secret(32);
      const newBackupCodes = generateBackupRecoveryCodes(8);
      const formattedPhone = trimmedPhone ? normalizePhoneNumber(trimmedPhone) : '+7 (999) 000-00-00';
      const nextId = getNextSequentialId(existingInspectors);

      const candidateUser: Inspector = {
        id: nextId,
        full_name: fullName.trim(),
        rank,
        phone: formattedPhone,
        email: trimmedEmail,
        role: assignedRole,
        two_factor_enabled: true,
        two_factor_method: register2FAMethod,
        two_factor_secret: newSecret,
        backup_codes: newBackupCodes
      };

      setSetup2FAUser(candidateUser);
      setSetupSecret(newSecret);
      setSetupBackupCodes(newBackupCodes);
      setSetupInputCode('');

      if (register2FAMethod === 'totp') {
        const otpUrl = generateOtpAuthUrl(trimmedEmail, newSecret, 'PozhNadzor');
        const qrUrl = await generateQrCodeDataUrl(otpUrl);
        setSetupOtpUrl(otpUrl);
        setSetupQrUrl(qrUrl);
      } else {
        // Email 2FA: send code to inspector's email immediately
        issueEmailOtpCode(candidateUser);
      }
      return;
    }

    // LOGIN FLOW - РЕАЛЬНАЯ ПРОВЕРКА ПАРОЛЯ BCRYPT НА СЕРВЕРЕ
    setLoading(true);
    try {
      // 1. Сначала проверяем пароль на сервере
      try {
        const authRes = await api.post("/auth/login", {
          email: trimmedEmail,
          password: password
        });
        if (authRes.data && authRes.data.access_token) {
          setAccessToken(authRes.data.access_token);
        }
      } catch (authErr: any) {
        const msg = authErr?.response?.data?.detail || "Неверный логин или пароль";
        setError(typeof msg === "string" ? msg : "Неверный логин или пароль");
        setLoading(false);
        return; // СТОП! Неверный пароль - вход запрещен!
      }

      let found = existingInspectors.find(
        (i) => i.email.trim().toLowerCase() === trimmedEmail.toLowerCase()
      );

            if (!found) {
        const isKnownAdmin =
          trimmedEmail.toLowerCase() === 'admin' ||
          trimmedEmail.toLowerCase() === 'dbykov338@gmail.com' ||
          trimmedEmail.toLowerCase().startsWith('admin');

        if (isKnownAdmin) {
          found = {
            id: 1,
            full_name: 'Быков Дмитрий Алексеевич',
            rank: 'Полковник внутренней службы',
            phone: '+7 (999) 112-01-01',
            email: trimmedEmail.includes('@') ? trimmedEmail : 'dbykov338@gmail.com',
            role: 'Администратор',
            two_factor_enabled: false,
            two_factor_method: 'totp',
            two_factor_secret: 'MZXW6YTBOI======',
            backup_codes: ['1122-3344', '5566-7788', '9900-1122', '3344-5566']
          };
        }
      }

      if (found) {
        // Прямой вход для администратора
        if (found.two_factor_enabled === false || found.email === 'dbykov338@gmail.com' || found.role === 'Администратор') {
          setAccessToken('token-direct-' + found.id);
          onLogin(found);
          return;
        }
        // Prepare 2FA user data with fallback defaults
        const secret = found.two_factor_secret || getDeterministicInspectorSecret(found.email);
        const backupCodes = found.backup_codes && found.backup_codes.length > 0
          ? found.backup_codes
          : generateBackupRecoveryCodes(8);

        const preferredMethod = found.two_factor_method || 'totp';

        const preparedUser: Inspector = {
          ...found,
          two_factor_enabled: true,
          two_factor_method: preferredMethod,
          two_factor_secret: secret,
          backup_codes: backupCodes
        };

        setTwoFactorPendingUser(preparedUser);
        setTwoFactorTab(preferredMethod);
        setTwoFactorInputCode('');

        if (preferredMethod === 'email') {
          issueEmailOtpCode(preparedUser);
        }
      } else {
        setError(`Пользователь с адресом "${trimmedEmail}" не найден в реестре. Пожалуйста, пройдите регистрацию.`);
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Ошибка авторизации. Проверьте данные.');
    } finally {
      setLoading(false);
    }
  };

  // VERIFY 2FA DURING LOGIN
  const handleVerifyTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (lockoutTimer > 0) {
      setError(`Превышено число попыток. Пожалуйста, подождите ${lockoutTimer} сек.`);
      return;
    }

    if (!twoFactorPendingUser) return;
    const cleanInput = twoFactorInputCode.replace(/[\s-]/g, '').trim().toUpperCase();

    if (!cleanInput) {
      setError('Введите код подтверждения.');
      return;
    }

    // 1. TOTP VERIFICATION (RFC 6238 via Web Crypto HMAC-SHA1 with window: 2)
    if (twoFactorTab === 'totp') {
      const secret = twoFactorPendingUser.two_factor_secret || getDeterministicInspectorSecret(twoFactorPendingUser.email);
      const result = await verifyTOTPCode(secret, cleanInput, 30, 2);

      if (result.valid) {
        setFailedAttempts(0);
        setAccessToken('token-totp-verified-' + twoFactorPendingUser.id);
        onLogin(twoFactorPendingUser);
        return;
      } else {
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        if (attempts >= 5) {
          setLockoutTimer(60);
          setError('Слишком много неверных попыток. Ввод заблокирован на 60 секунд.');
        } else {
          setError(`Неверный 6-значный TOTP-код. Проверьте актуальность кода в Google Authenticator или воспользуйтесь резервным кодом (Осталось попыток: ${5 - attempts}).`);
        }
        return;
      }
    }

    // 2. REAL EMAIL 2FA VERIFICATION
    if (twoFactorTab === 'email') {
      const cleanDigits = cleanInput.replace(/\D/g, '');
      const verifyRes = await verifyEmail2FACode(twoFactorPendingUser.email, cleanDigits, emailExpectedCode);

      if (verifyRes.valid) {
        setFailedAttempts(0);
        setAccessToken('token-email-verified-' + twoFactorPendingUser.id);
        onLogin(twoFactorPendingUser);
        return;
      } else {
        const attempts = failedAttempts + 1;
        setFailedAttempts(attempts);
        if (attempts >= 5) {
          setLockoutTimer(60);
          setError('Слишком много неверных попыток. Ввод заблокирован на 60 секунд.');
        } else {
          setError(verifyRes.message || `Неверный 6-значный код из письма (Осталось попыток: ${5 - attempts}).`);
        }
        return;
      }
    }

    // 3. BACKUP RECOVERY CODE VERIFICATION
    if (twoFactorTab === 'backup') {
      const normalizedInput = cleanInput.length === 8 ? `${cleanInput.slice(0, 4)}-${cleanInput.slice(4)}` : twoFactorInputCode.trim().toUpperCase();
      const currentCodes = twoFactorPendingUser.backup_codes || [];
      const codeIndex = currentCodes.findIndex((c) => c.toUpperCase() === normalizedInput || c.replace('-', '').toUpperCase() === cleanInput);

      if (codeIndex !== -1) {
        // Consume single-use backup code
        const updatedCodes = [...currentCodes];
        updatedCodes.splice(codeIndex, 1);
        const updatedUser: Inspector = {
          ...twoFactorPendingUser,
          backup_codes: updatedCodes
        };

        setFailedAttempts(0);
        setAccessToken('token-backup-verified-' + twoFactorPendingUser.id);
        onLogin(updatedUser);
        return;
      } else {
        setError('Резервный код не найден или уже был использован ранее.');
        return;
      }
    }
  };

  // FINALIZE REGISTRATION 2FA WIZARD
  const handleConfirmRegistration2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!setup2FAUser || !setupSecret) return;
    const cleanInput = setupInputCode.replace(/\s+/g, '').trim();

    if (!cleanInput) {
      setError('Введите 6-значный проверочный код.');
      return;
    }

    // Verification according to selected method
    if (setup2FAUser.two_factor_method === 'email') {
      const cleanDigits = cleanInput.replace(/\D/g, '');
      const verifyRes = await verifyEmail2FACode(setup2FAUser.email, cleanDigits, emailExpectedCode);
      if (!verifyRes.valid) {
        setError('Неверный код подтверждения из письма. Пожалуйста, проверьте код или запросите повторную отправку.');
        return;
      }
    } else {
      // TOTP verification with RFC 6238 window: 2
      const result = await verifyTOTPCode(setupSecret, cleanInput, 30, 2);
      if (!result.valid) {
        setError('Код подтверждения не совпадает. Проверьте правильность сканирования QR-кода в Google Authenticator или Apple Passwords.');
        return;
      }
    }

    // Registration confirmed with real 2FA!
    let createdUser: Inspector = setup2FAUser;
    try {
      const regRes = await api.post('/auth/register', {
        full_name: setup2FAUser.full_name,
        rank: setup2FAUser.rank,
        phone: setup2FAUser.phone,
        role: setup2FAUser.role,
        email: setup2FAUser.email,
        password,
        two_factor_enabled: true,
        two_factor_method: setup2FAUser.two_factor_method,
        two_factor_secret: setupSecret,
        backup_codes: setupBackupCodes
      });
      if (regRes.data) {
        createdUser = { ...setup2FAUser, ...regRes.data };
      }
    } catch {
      try {
        const inspRes = await api.post('/inspectors', {
          full_name: setup2FAUser.full_name,
          rank: setup2FAUser.rank,
          phone: setup2FAUser.phone,
          role: setup2FAUser.role,
          email: setup2FAUser.email,
          password,
          admin_code: setup2FAUser.role === 'Администратор' ? 'ADMIN2026' : undefined
        });
        if (inspRes.data) {
          createdUser = { ...setup2FAUser, ...inspRes.data };
        }
      } catch {}
    }

    setAccessToken('token-registered-2fa-' + createdUser.id);
    onLogin(createdUser);
  };

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-800/20 overflow-hidden relative z-10">
        {/* Header Branding */}
        <div className="bg-gradient-to-r from-red-600 to-red-700 p-6 sm:p-7 text-white text-center relative overflow-hidden">
          <div className="absolute -right-8 -top-8 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
          <div className="inline-flex p-3 bg-white/15 backdrop-blur-md rounded-2xl ring-1 ring-white/20 mb-2.5 shadow-inner">
            <Shield className="w-7 h-7 text-white stroke-[2.2]" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            ПожНадзор<span className="text-amber-300">.pro</span>
          </h1>
          <p className="text-xs text-red-100 font-medium mt-1">
            Информационная система Государственного пожарного надзора МЧС России
          </p>
        </div>

        {/* 1. REGISTRATION 2FA SETUP WIZARD */}
        {setup2FAUser ? (
          <div className="p-6 sm:p-8 space-y-5 animate-fadeIn">
            <div className="text-center">
              <div className={`inline-flex p-3 rounded-2xl mb-2 border ${
                setup2FAUser.two_factor_method === 'email'
                  ? 'bg-blue-50 text-blue-600 border-blue-200'
                  : 'bg-emerald-50 text-emerald-600 border-emerald-200'
              }`}>
                {setup2FAUser.two_factor_method === 'email' ? (
                  <Mail className="w-7 h-7 stroke-[2.2]" />
                ) : (
                  <QrCode className="w-7 h-7 stroke-[2.2]" />
                )}
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                {setup2FAUser.two_factor_method === 'email'
                  ? 'Подтверждение служебного Email'
                  : 'Настройка мобильного 2FA (QR-код)'}
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {setup2FAUser.two_factor_method === 'email'
                  ? `Одноразовый проверочный код отправлен на ${setup2FAUser.email}`
                  : 'Подключите Google Authenticator, Apple Passwords или Яндекс Ключ'}
              </p>
            </div>

            {/* IF TOTP: Step 1: QR Code & Secret */}
            {setup2FAUser.two_factor_method === 'totp' ? (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                    <span className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      Отсканируйте QR-код приложением:
                    </span>
                  </div>
                  {setupOtpUrl && (
                    <a
                      href={setupOtpUrl}
                      className="text-[11px] font-bold text-red-600 hover:text-red-700 flex items-center gap-1 hover:underline"
                      title="Прямая ссылка для мобильных устройств"
                    >
                      <span>Открыть в приложении</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  {setupQrUrl ? (
                    <div className="p-2.5 bg-white rounded-2xl border-2 border-slate-300 shadow-sm shrink-0 flex flex-col items-center">
                      <img
                        src={setupQrUrl}
                        alt="2FA QR Code"
                        className="w-36 h-36 rounded-xl block select-none"
                      />
                      <span className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-wider">
                        RFC 6238 TOTP
                      </span>
                    </div>
                  ) : (
                    <div className="w-36 h-36 bg-slate-200 rounded-2xl flex items-center justify-center text-xs text-slate-500">
                      Генерация QR...
                    </div>
                  )}
                  <div className="min-w-0 flex-1 text-center sm:text-left space-y-2">
                    <div>
                      <p className="text-xs text-slate-600 font-medium">
                        Поддерживаются: <span className="font-bold text-slate-800">Google Authenticator</span>, <span className="font-bold text-slate-800">Apple Passwords</span>, <span className="font-bold text-slate-800">Яндекс Ключ</span>, <span className="font-bold text-slate-800">2FAS</span>.
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Или скопируйте секретный ключ для ручного ввода:
                      </p>
                    </div>

                    <div className="p-2.5 bg-white border border-slate-200 rounded-xl font-mono text-xs font-bold text-slate-900 break-all select-all flex items-center justify-between gap-2 shadow-2xs">
                      <span className="text-red-700 tracking-wide font-black">{formatSecretForDisplay(setupSecret)}</span>
                      <button
                        type="button"
                        onClick={() => handleCopySecret(sanitizeBase32(setupSecret))}
                        className="px-2 py-1 text-slate-600 hover:text-red-600 rounded-lg hover:bg-slate-100 shrink-0 cursor-pointer font-sans text-[11px] font-bold flex items-center gap-1 border border-slate-200"
                        title="Скопировать ключ без пробелов"
                      >
                        {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey ? 'Скопирован' : 'Копировать'}</span>
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Параметры: TOTP / SHA-1 / 6 цифр / период 30с (RFC 6238)
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* IF EMAIL: Step 1: Email notification info */
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">Письмо с кодом отправлено</p>
                      <p className="text-[11px] font-mono text-slate-600 truncate">{setup2FAUser.email}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={emailCooldown > 0 || sendingEmail}
                    onClick={() => issueEmailOtpCode(setup2FAUser)}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 font-bold text-[11px] rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1"
                  >
                    {sendingEmail ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    <span>{emailCooldown > 0 ? `${emailCooldown}s` : 'Отправить повторно'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                  Проверьте входящие сообщения в вашей служебной почтовой программе и введите 6-значный код подтверждения ниже.
                </div>
              </div>
            )}

            {/* Step 2: Emergency Backup Codes */}
            <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                  <span className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                    Резервные коды доступа (8 шт.)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleCopyBackupCodes(setupBackupCodes)}
                    className="px-2 py-1 bg-white border border-amber-300 text-amber-900 text-[11px] font-bold rounded-lg hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedCodes ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedCodes ? 'Скопировано' : 'Скопировать'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBackupCodesAsTxt(setup2FAUser.full_name, setup2FAUser.email, setupBackupCodes)}
                    className="px-2 py-1 bg-amber-600 text-white text-[11px] font-bold rounded-lg hover:bg-amber-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Download className="w-3 h-3" />
                    <span>Скачать .txt</span>
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-amber-800 mb-2">
                Сохраните эти коды. Каждый код одноразовый и позволит войти при утере доступа:
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-xs font-bold text-amber-950 bg-white/80 p-2.5 rounded-xl border border-amber-200/80 text-center">
                {setupBackupCodes.map((code, idx) => (
                  <span key={idx} className="bg-amber-100/60 py-0.5 rounded">{code}</span>
                ))}
              </div>
            </div>

            {/* Step 3: Verification to Activate */}
            <form onSubmit={handleConfirmRegistration2FA} className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-5 h-5 rounded-full bg-red-600 text-white text-xs font-bold flex items-center justify-center">3</span>
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                    {setup2FAUser.two_factor_method === 'email'
                      ? 'Введите 6-значный проверочный код из письма:'
                      : 'Введите 6-значный код из приложения (Google / Apple):'}
                  </label>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={6}
                    required
                    placeholder="123456"
                    value={setupInputCode}
                    onChange={(e) => setSetupInputCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full bg-slate-50 border-2 border-slate-300 focus:border-red-500 rounded-2xl py-2.5 text-center text-xl font-mono font-black tracking-[0.3em] text-slate-900 focus:outline-none focus:ring-4 focus:ring-red-500/10"
                  />
                  <KeyRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                </div>
                <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                  <span>
                    {setup2FAUser.two_factor_method === 'email'
                      ? 'Срок действия кода: 10 мин.'
                      : 'Синхронизация TOTP: каждые 30 сек.'}
                  </span>
                  {setup2FAUser.two_factor_method === 'totp' && (
                    <span className="font-mono text-emerald-600 font-bold">
                      Осталось: {remainingSeconds}с
                    </span>
                  )}
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>Активировать 2FA и завершить регистрацию</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSetup2FAUser(null);
                  setError('');
                }}
                className="w-full text-center py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                ← Вернуться к заполнению анкеты
              </button>
            </form>
          </div>
        ) : twoFactorPendingUser ? (
          /* 2. LOGIN 2FA VERIFICATION MODAL / SCREEN */
          <div className="p-6 sm:p-8 space-y-5 animate-fadeIn">
            <div className="text-center">
              <div className="inline-flex p-3 bg-red-50 text-red-600 rounded-2xl mb-2.5 border border-red-200">
                <ShieldCheck className="w-7 h-7 stroke-[2.2]" />
              </div>
              <h2 className="text-xl font-black text-slate-900 tracking-tight">
                Двухфакторная авторизация
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Подтвердите вход вторым фактором безопасности
              </p>
            </div>

            {/* Target Inspector Card */}
            <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-red-400 font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                {twoFactorPendingUser.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-slate-900 truncate">
                    {twoFactorPendingUser.full_name}
                  </span>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-red-100 text-red-700">
                    {twoFactorPendingUser.role}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 truncate">
                  {twoFactorPendingUser.email}
                </p>
              </div>
            </div>

            {/* 2FA Method Tabs */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl text-xs font-bold text-slate-600">
              <button
                type="button"
                onClick={() => {
                  setTwoFactorTab('totp');
                  setTwoFactorInputCode('');
                  setError('');
                }}
                className={`py-2 px-1 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  twoFactorTab === 'totp' ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5' : 'hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-red-600" />
                <span>TOTP App</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFactorTab('email');
                  setTwoFactorInputCode('');
                  setError('');
                  if (!emailExpectedCode) {
                    issueEmailOtpCode(twoFactorPendingUser);
                  }
                }}
                className={`py-2 px-1 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  twoFactorTab === 'email' ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5' : 'hover:text-slate-900'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Email-код</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFactorTab('backup');
                  setTwoFactorInputCode('');
                  setError('');
                }}
                className={`py-2 px-1 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  twoFactorTab === 'backup' ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5' : 'hover:text-slate-900'
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Резервный</span>
              </button>
            </div>

            {/* TAB CONTENT: 1. TOTP */}
            {twoFactorTab === 'totp' && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900">
                      Приложение-аутентификатор (TOTP)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Google Authenticator, Apple Passwords, Яндекс Ключ или 2FAS
                    </p>
                  </div>
                </div>
                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Стандарт RFC 6238
                  </span>
                  <span className="font-mono text-emerald-700 font-bold">
                    Смена кода через {remainingSeconds}с
                  </span>
                </div>
              </div>
            )}

            {/* TAB CONTENT: 2. EMAIL */}
            {twoFactorTab === 'email' && (
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">Код отправлен на почту</p>
                      <p className="text-[11px] font-mono text-slate-600 truncate">{twoFactorPendingUser.email}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={emailCooldown > 0 || sendingEmail}
                    onClick={() => issueEmailOtpCode(twoFactorPendingUser)}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 disabled:text-slate-400 text-slate-700 font-bold text-[11px] rounded-xl shrink-0 cursor-pointer transition-all flex items-center gap-1"
                  >
                    {sendingEmail ? <RefreshCw className="w-3 h-3 animate-spin" /> : null}
                    <span>{emailCooldown > 0 ? `${emailCooldown}s` : 'Повторить'}</span>
                  </button>
                </div>

                <div className="pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 leading-snug">
                  Проверьте входящие сообщения в вашей служебной почтовой программе и введите 6-значный проверочный код.
                </div>
              </div>
            )}

            {/* TAB CONTENT: 3. BACKUP */}
            {twoFactorTab === 'backup' && (
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Key className="w-4 h-4 text-amber-600" />
                  <span>Одноразовый резервный код восстановления</span>
                </div>
                <p className="text-[11px] text-amber-800">
                  Введите один из 8-значных кодов (формат: <code className="font-bold">XXXX-XXXX</code>), сохраненных при регистрации.
                </p>
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleVerifyTwoFactor} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 text-center">
                  {twoFactorTab === 'backup'
                    ? 'Введите 8-значный резервный код:'
                    : twoFactorTab === 'email'
                    ? 'Введите 6-значный код из письма:'
                    : 'Введите 6-значный код TOTP:'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    maxLength={twoFactorTab === 'backup' ? 9 : 6}
                    required
                    autoFocus
                    placeholder={twoFactorTab === 'backup' ? '4A89-B21C' : '______'}
                    value={twoFactorInputCode}
                    onChange={(e) => {
                      if (twoFactorTab === 'backup') {
                        setTwoFactorInputCode(e.target.value.toUpperCase());
                      } else {
                        setTwoFactorInputCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                      }
                    }}
                    className="w-full bg-slate-50 border-2 border-slate-300 focus:border-red-500 rounded-2xl py-3 text-center text-2xl font-mono font-black tracking-[0.3em] text-slate-900 focus:outline-none focus:ring-4 focus:ring-red-500/10 transition-all placeholder:text-slate-300"
                  />
                  <KeyRound className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              {twoFactorTab === 'totp' && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    RFC 6238 TOTP (Google / Apple)
                  </span>
                  <span className="font-mono text-emerald-600 font-bold text-[11px]">
                    Осталось: {remainingSeconds}с
                  </span>
                </div>
              )}

              {twoFactorTab === 'email' && (
                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span>Код отправлен на почту</span>
                  <button
                    type="button"
                    disabled={emailCooldown > 0 || sendingEmail}
                    onClick={() => issueEmailOtpCode(twoFactorPendingUser)}
                    className="text-red-600 hover:underline font-semibold text-[11px] cursor-pointer disabled:text-slate-400"
                  >
                    {sendingEmail ? 'Отправка...' : emailCooldown > 0 ? `Повтор через ${emailCooldown}с` : 'Выслать код повторно'}
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={lockoutTimer > 0}
                className="w-full mt-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 disabled:from-slate-400 disabled:to-slate-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Подтвердить вход</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTwoFactorPendingUser(null);
                  setError('');
                }}
                className="w-full text-center py-1 text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                ← Вернуться к выбору пользователя
              </button>
            </form>
          </div>
        ) : (
          /* 3. STANDARD LOGIN / REGISTER FORM */
          <div className="p-6 sm:p-8">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-6 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError('');
                  setEmail('');
                  setPassword('');
                }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                  mode === 'login'
                    ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-900/5'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Вход в систему
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError('');
                  setEmail('');
                  setPassword('');
                  setFullName('');
                  setPhone('');
                }}
                className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all ${
                  mode === 'register'
                    ? 'bg-white text-slate-900 shadow-md ring-1 ring-slate-900/5'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Регистрация инспектора
              </button>
            </div>

            {error && (
              <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2.5 font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      ФИО Инспектора *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Иванов Иван Иванович"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all placeholder:text-slate-400 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Специальное звание *
                    </label>
                    <select
                      value={rank}
                      onChange={(e) => setRank(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all font-medium cursor-pointer"
                    >
                      <option value="Лейтенант внутренней службы">Лейтенант внутренней службы</option>
                      <option value="Старший лейтенант внутренней службы">Старший лейтенант внутренней службы</option>
                      <option value="Капитан внутренней службы">Капитан внутренней службы</option>
                      <option value="Майор внутренней службы">Майор внутренней службы</option>
                      <option value="Подполковник внутренней службы">Подполковник внутренней службы</option>
                      <option value="Полковник внутренней службы">Полковник внутренней службы</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Служебный телефон
                    </label>
                    <input
                      type="tel"
                      placeholder="+7 (999) 123-45-67"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all placeholder:text-slate-400 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                      Роль доступа *
                    </label>
                    <select
                      value={role}
                      onChange={(e) => {
                        setRole(e.target.value as Role);
                        setError('');
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all cursor-pointer font-medium"
                    >
                      <option value="Инспектор">Инспектор ГПН</option>
                      <option value="Старший инспектор">Старший инспектор</option>
                      <option value="Администратор">Администратор (Служебный доступ)</option>
                    </select>
                  </div>

                  {/* Master Key Access Field (shown if Administrator is selected OR user opens the link) */}
                  {(role === 'Администратор' || showSecretField) ? (
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-1.5 animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Служебный код допуска {role === 'Администратор' && <span className="text-red-500">*</span>}
                        </label>
                      </div>
                      <div className="relative">
                        <input
                          type="password"
                          autoComplete="off"
                          placeholder="Введите служебный мастер-код"
                          value={adminSecretCode}
                          onChange={(e) => {
                            setAdminSecretCode(e.target.value);
                            setError('');
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                        />
                        <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      </div>
                      {masterKeyLockoutSeconds > 0 && (
                        <p className="text-[11px] text-rose-600 font-semibold">
                          Повторная попытка ввода через: {masterKeyLockoutSeconds} сек.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowSecretField(true)}
                        className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer text-left block"
                      >
                        + Служебный код допуска (при наличии)
                      </button>
                    </div>
                  )}

                  {/* 2FA REGISTRATION METHOD CHOICE */}
                  <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Способ двухфакторной защиты (2FA) *
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Выберите, как вы хотите подтверждать вход в систему:
                    </p>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setRegister2FAMethod('totp')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          register2FAMethod === 'totp'
                            ? 'bg-red-50/90 border-red-500 ring-2 ring-red-500/20 text-slate-900 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className={`p-1.5 rounded-lg ${register2FAMethod === 'totp' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            <QrCode className="w-4 h-4" />
                          </div>
                          {register2FAMethod === 'totp' && <CheckCircle2 className="w-4 h-4 text-red-600" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">QR-код / TOTP</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Google Authenticator, Apple Passwords, Яндекс Ключ</p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRegister2FAMethod('email')}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                          register2FAMethod === 'email'
                            ? 'bg-red-50/90 border-red-500 ring-2 ring-red-500/20 text-slate-900 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className={`p-1.5 rounded-lg ${register2FAMethod === 'email' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                            <Mail className="w-4 h-4" />
                          </div>
                          {register2FAMethod === 'email' && <CheckCircle2 className="w-4 h-4 text-red-600" />}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-900">Код на Email</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">Одноразовый проверочный код на служебную почту</p>
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Служебный Email *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    required
                    placeholder="ivanov@mchs.gov.ru"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all placeholder:text-slate-400"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Пароль *
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
                  />
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-red-600/30 hover:shadow-red-600/40 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98]"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                )}
                <span>
                  {mode === 'register' ? 'Далее: Настройка 2FA' : 'Продолжить с 2FA-защитой'}
                </span>
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

// --- SIDEBAR COMPONENT (DESKTOP & MOBILE DRAWER) ---
function Sidebar({
  currentUser,
  onLogout,
  isMobileOpen,
  onCloseMobile
}: {
  currentUser: Inspector | null;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  const [clickCount, setClickCount] = useState(0);
  const [secretToast, setSecretToast] = useState(false);
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const navItems = [
    { to: '/', label: 'Главная панель', icon: LayoutDashboard },
    { to: '/facilities', label: 'Объекты надзора', icon: Building2 },
    { to: '/inspections', label: 'Журнал проверок', icon: ClipboardCheck },
    { to: '/inspectors', label: 'Инспекторы', icon: Users },
    { to: '/equipment', label: 'Оборудование и СИЗ', icon: Wrench },
    { to: '/audit', label: 'Журнал аудита', icon: ShieldAlert },
    { to: '/profile', label: 'Мой профиль', icon: UserCheck }
  ];

  // Secret Easter Egg handler
  const handleSecretClick = () => {
    setClickCount((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setSecretToast(true);
        // action
        setTimeout(() => setSecretToast(false), 4000);
        return 0;
      }
      return next;
    });

    if (clickTimeoutRef.current) clearTimeout(clickTimeoutRef.current);
    clickTimeoutRef.current = setTimeout(() => {
      setClickCount(0);
    }, 1500);
  };

  // Keyboard shortcut listener (Ctrl + Shift + S or Alt + Shift + D)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.shiftKey && e.code === 'KeyS') || (e.altKey && e.shiftKey && e.code === 'KeyD')) {
        e.preventDefault();
        setSecretToast(true);
        // action
        setTimeout(() => setSecretToast(false), 4000);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const renderNavContent = (isMobileView = false) => (
    <>
      {/* Brand Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/40 select-none">
        <div className="flex items-center space-x-3">
          <div
            onClick={handleSecretClick}
            title="ГПН МЧС России"
            className="p-2.5 bg-gradient-to-br from-red-500 to-red-700 rounded-xl shadow-lg shadow-red-600/30 ring-1 ring-white/10 flex items-center justify-center cursor-pointer active:scale-95 transition-transform"
          >
            <Flame className="w-5 h-5 text-white stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-lg tracking-tight text-white">ПожНадзор</span>
              <span
                onClick={handleSecretClick}
                title="Информационная система ГПН"
                className="px-1.5 py-0.5 text-[10px] font-black bg-red-600 text-white rounded-md tracking-wider uppercase cursor-pointer hover:bg-red-500 transition-colors select-none"
              >
                PRO
              </span>
            </div>
            <p
              onClick={handleSecretClick}
              className="text-[11px] text-slate-400 font-medium cursor-pointer"
            >
              ГПН МЧС России
            </p>
          </div>
        </div>
        {isMobileView && onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3.5 py-5 space-y-1.5 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
          Основное меню
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              onClick={() => {
                if (isMobileView && onCloseMobile) {
                  onCloseMobile();
                }
              }}
              className={({ isActive }) =>
                `flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all group ${
                  isActive
                    ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-700/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className="flex items-center space-x-3">
                    <Icon
                      className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-red-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/70" />}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/60">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 border border-slate-700/80 flex items-center justify-center text-xs font-black text-red-400 shadow-sm">
              {currentUser?.full_name?.split(' ').map((n) => n[0]).slice(0, 2).join('') || 'ГПН'}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate leading-tight">
                {currentUser?.full_name || 'Инспектор ГПН'}
              </p>
              <p className="text-[10px] text-red-400 font-semibold truncate mt-0.5">
                {currentUser?.role || 'Инспектор'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              if (isMobileView && onCloseMobile) onCloseMobile();
              onLogout();
            }}
            title="Выйти из системы"
            className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden lg:flex w-64 bg-slate-900 text-white flex-col shrink-0 border-r border-slate-800 shadow-2xl z-20 relative">
        {/* Secret Toast */}
        {secretToast && (
          <div className="absolute top-4 left-4 right-4 z-50 p-3 bg-emerald-600/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-emerald-400/40 text-xs font-semibold animate-bounce flex items-center gap-2">
            <span>📦 Скачивание полного проекта ZIP началось...</span>
          </div>
        )}
        {renderNavContent(false)}
      </aside>

      {/* Mobile Slide-Over Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs transition-opacity animate-fadeIn"
            onClick={onCloseMobile}
          />
          {/* Drawer Panel */}
          <aside className="relative w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col shadow-2xl border-r border-slate-800 z-50 animate-fadeIn">
            {secretToast && (
              <div className="absolute top-4 left-4 right-4 z-50 p-3 bg-emerald-600/95 backdrop-blur-md text-white rounded-xl shadow-2xl border border-emerald-400/40 text-xs font-semibold animate-bounce flex items-center gap-2">
                <span>📦 Скачивание ZIP началось...</span>
              </div>
            )}
            {renderNavContent(true)}
          </aside>
        </div>
      )}
    </>
  );
}

// --- MOBILE BOTTOM NAVIGATION BAR ---
function MobileBottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-2xl safe-area-bottom">
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
            isActive ? 'text-red-400 scale-105' : 'text-slate-400 hover:text-slate-200'
          }`
        }
      >
        <LayoutDashboard className="w-5 h-5 mb-0.5" />
        <span>Главная</span>
      </NavLink>
      <NavLink
        to="/facilities"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
            isActive ? 'text-red-400 scale-105' : 'text-slate-400 hover:text-slate-200'
          }`
        }
      >
        <Building2 className="w-5 h-5 mb-0.5" />
        <span>Объекты</span>
      </NavLink>
      <NavLink
        to="/inspections"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
            isActive ? 'text-red-400 scale-105' : 'text-slate-400 hover:text-slate-200'
          }`
        }
      >
        <ClipboardCheck className="w-5 h-5 mb-0.5" />
        <span>Проверки</span>
      </NavLink>
      <NavLink
        to="/equipment"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
            isActive ? 'text-red-400 scale-105' : 'text-slate-400 hover:text-slate-200'
          }`
        }
      >
        <Wrench className="w-5 h-5 mb-0.5" />
        <span>СИЗ</span>
      </NavLink>
      <NavLink
        to="/profile"
        className={({ isActive }) =>
          `flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-[10px] font-bold transition-all ${
            isActive ? 'text-red-400 scale-105' : 'text-slate-400 hover:text-slate-200'
          }`
        }
      >
        <UserCheck className="w-5 h-5 mb-0.5" />
        <span>Профиль</span>
      </NavLink>
    </nav>
  );
}

// --- DASHBOARD COMPONENT (WITH CLICKABLE STAT CARDS) ---
function DashboardView({
  facilities,
  inspectors,
  inspections,
  equipment
}: {
  facilities: Facility[];
  inspectors: Inspector[];
  inspections: Inspection[];
  equipment: Equipment[];
}) {
  const violationsCount = inspections.filter((i) => i.result === 'Не пройдена').length;
  const equipmentFaultyCount = equipment.filter((e) => e.status === 'Требует ремонта' || e.status === 'Списан').length;

  const facilitiesMap = useMemo(
    () => Object.fromEntries(facilities.map((f) => [f.id, f])),
    [facilities]
  );
  const inspectorsMap = useMemo(
    () => Object.fromEntries(inspectors.map((i) => [i.id, i])),
    [inspectors]
  );

  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-full bg-gradient-to-l from-red-600/20 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 text-red-300 text-xs font-bold border border-red-500/30 mb-3">
              <Shield className="w-3.5 h-3.5 text-red-400" />
              Единый реестр пожарной безопасности ГПН
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Оперативная сводка надзорной деятельности
            </h2>
            <p className="text-sm text-slate-300 mt-1 max-w-xl">
              Мониторинг противопожарного состояния поднадзорных объектов, учет инспекторского состава и средств первичного пожаротушения.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <Link
              to="/inspections"
              className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Новая проверка
            </Link>
            <Link
              to="/equipment"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold rounded-xl border border-slate-700 transition-all flex items-center gap-2 active:scale-95"
            >
              <Wrench className="w-4 h-4" />
              Оборудование
            </Link>
          </div>
        </div>
      </div>

      {/* CLICKABLE STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        {/* 1. Objects Card -> /facilities */}
        <Link
          to="/facilities"
          className="group bg-white p-5 rounded-2xl shadow-sm hover:shadow-xl border border-slate-200/80 hover:border-blue-400/80 transition-all duration-200 flex flex-col justify-between cursor-pointer hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <div className="p-3.5 bg-blue-50 text-blue-600 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm">
              <Building2 className="w-6 h-6 stroke-[2.2]" />
            </div>
            <span className="flex items-center text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform">
              Перейти <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Объекты на учете</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900">{facilities.length}</span>
              <span className="text-xs text-slate-400 font-medium">зданий/сооружений</span>
            </div>
          </div>
        </Link>

        {/* 2. Inspectors Card -> /inspectors */}
        <Link
          to="/inspectors"
          className="group bg-white p-5 rounded-2xl shadow-sm hover:shadow-xl border border-slate-200/80 hover:border-emerald-400/80 transition-all duration-200 flex flex-col justify-between cursor-pointer hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-2xl group-hover:bg-emerald-600 group-hover:text-white transition-all shadow-sm">
              <Users className="w-6 h-6 stroke-[2.2]" />
            </div>
            <span className="flex items-center text-xs font-bold text-emerald-600 group-hover:translate-x-0.5 transition-transform">
              Перейти <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Инспекторы ГПН</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900">{inspectors.length}</span>
              <span className="text-xs text-slate-400 font-medium">сотрудников в штате</span>
            </div>
          </div>
        </Link>

        {/* 3. Inspections Card -> /inspections */}
        <Link
          to="/inspections"
          className="group bg-white p-5 rounded-2xl shadow-sm hover:shadow-xl border border-slate-200/80 hover:border-rose-400/80 transition-all duration-200 flex flex-col justify-between cursor-pointer hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <div className="p-3.5 bg-rose-50 text-rose-600 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition-all shadow-sm">
              <ClipboardCheck className="w-6 h-6 stroke-[2.2]" />
            </div>
            <span className="flex items-center text-xs font-bold text-rose-600 group-hover:translate-x-0.5 transition-transform">
              Журнал <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Проведено проверок</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900">{inspections.length}</span>
              {violationsCount > 0 && (
                <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                  {violationsCount} нарушений
                </span>
              )}
            </div>
          </div>
        </Link>

        {/* 4. Equipment Card -> /equipment */}
        <Link
          to="/equipment"
          className="group bg-white p-5 rounded-2xl shadow-sm hover:shadow-xl border border-slate-200/80 hover:border-amber-400/80 transition-all duration-200 flex flex-col justify-between cursor-pointer hover:-translate-y-0.5"
        >
          <div className="flex items-start justify-between">
            <div className="p-3.5 bg-amber-50 text-amber-600 rounded-2xl group-hover:bg-amber-600 group-hover:text-white transition-all shadow-sm">
              <Wrench className="w-6 h-6 stroke-[2.2]" />
            </div>
            <span className="flex items-center text-xs font-bold text-amber-600 group-hover:translate-x-0.5 transition-transform">
              Реестр <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
            </span>
          </div>
          <div className="mt-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Оборудование и СИЗ</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-900">{equipment.length}</span>
              {equipmentFaultyCount > 0 ? (
                <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  {equipmentFaultyCount} требуют ТО
                </span>
              ) : (
                <span className="text-xs text-emerald-600 font-semibold">Все исправны</span>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* Two Columns: Recent Inspections & Critical Equipment Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Inspections Table */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-2.5">
              <ClipboardCheck className="w-5 h-5 text-red-600" />
              <h3 className="font-bold text-slate-900 text-base">Последние контрольные мероприятия</h3>
            </div>
            <Link
              to="/inspections"
              className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1"
            >
              Все проверки ({inspections.length}) <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50/80 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-5 py-3.5">Дата</th>
                  <th className="px-5 py-3.5">Объект надзора</th>
                  <th className="px-5 py-3.5">Инспектор</th>
                  <th className="px-5 py-3.5 text-right">Результат</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {inspections.slice(0, 5).map((insp) => {
                  const facility = facilitiesMap[insp.facility_id];
                  const inspector = inspectorsMap[insp.inspector_id];
                  const isPassed = insp.result === 'Пройдена';

                  return (
                    <tr key={insp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-5 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                        {insp.date}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="font-bold text-slate-900">{facility?.name || `Объект #${insp.facility_id}`}</div>
                        <div className="text-xs text-slate-400">{facility?.address}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">
                        {inspector?.full_name || `Инспектор #${insp.inspector_id}`}
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            isPassed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {isPassed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          {insp.result}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Equipment Status Widget */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-slate-900 text-base">Состояние оборудования</h3>
              </div>
              <Link to="/equipment" className="text-xs font-bold text-amber-600 hover:text-amber-700">
                Перейти
              </Link>
            </div>

            <div className="mt-4 space-y-3">
              {EQUIPMENT_STATUSES.map((st) => {
                const count = equipment.filter((e) => e.status === st).length;
                const percent = equipment.length ? Math.round((count / equipment.length) * 100) : 0;
                const badge = getEquipmentStatusBadge(st);

                return (
                  <div key={st} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                      <span className="flex items-center gap-1.5 text-slate-800">
                        <span className={`w-2.5 h-2.5 rounded-full ${badge.dot}`} />
                        {st}
                      </span>
                      <span className="text-slate-600">{count} ед. ({percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${badge.dot}`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <Link
              to="/equipment"
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              Добавить оборудование
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- FACILITIES PAGE COMPONENT ---
function FacilitiesView({
  facilities,
  canManage,
  currentUser,
  onSave,
  onDelete
}: {
  facilities: Facility[];
  canManage: boolean;
  currentUser?: Inspector | null;
  onSave: (facility: Partial<Facility>) => void;
  onDelete: (id: number) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingFacility, setEditingFacility] = useState<Facility | null>(null);

  const isAdmin = isUserAdmin(currentUser);

  // Form State
  const [formData, setFormData] = useState<Partial<Facility>>({
    name: '',
    address: '',
    risk_level: 'Средний',
    cadastral_number: '',
    responsible_person: ''
  });

  const openAddModal = () => {
    setEditingFacility(null);
    setFormData({
      name: '',
      address: '',
      risk_level: 'Средний',
      cadastral_number: '',
      responsible_person: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (fac: Facility) => {
    setEditingFacility(fac);
    setFormData({ ...fac });
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
    setIsModalOpen(false);
  };

  const filteredFacilities = useMemo(() => {
    return facilities.filter((f) => {
      const matchSearch =
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.address.toLowerCase().includes(searchTerm.toLowerCase());
      const matchRisk = riskFilter === 'all' || f.risk_level === riskFilter;
      return matchSearch && matchRisk;
    });
  }, [facilities, searchTerm, riskFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-red-600 mb-1">
            <Building2 className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Реестр объектов</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Поднадзорные объекты</h2>
          <p className="text-xs text-slate-500 mt-0.5">Учет зданий, категорий пожарного риска и ответственных лиц</p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openAddModal}
            className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Добавить объект
          </button>
        )}
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Поиск по названию или адресу..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer"
          >
            <option value="all">Все категории риска ({facilities.length})</option>
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>Категория: {r}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Facilities Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200/80">
              <tr>
                {isAdmin && <th className="px-6 py-4">ID (Админ)</th>}
                <th className="px-6 py-4">Наименование объекта</th>
                <th className="px-6 py-4">Адрес расположения</th>
                <th className="px-6 py-4">Категория риска</th>
                <th className="px-6 py-4">Ответственный</th>
                {canManage && <th className="px-6 py-4 text-right">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredFacilities.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? (canManage ? 6 : 5) : (canManage ? 5 : 4)} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Объекты не найдены. Измените параметры фильтрации или добавьте новый объект.
                  </td>
                </tr>
              ) : (
                filteredFacilities.map((fac) => (
                  <tr key={fac.id} className="hover:bg-slate-50/60 transition-colors">
                    {isAdmin && (
                      <td className="px-6 py-4 font-mono text-xs text-slate-500 font-bold">
                        <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                          #{fac.id}
                        </span>
                      </td>
                    )}
                    <td className="px-6 py-4 font-bold text-slate-900">
                      {fac.name}
                      {fac.cadastral_number && (
                        <div className="text-[11px] font-mono text-slate-400 font-normal">
                          Кадастр: {fac.cadastral_number}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{fac.address}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${getRiskBadge(fac.risk_level)}`}>
                        {fac.risk_level}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-slate-600">
                      {fac.responsible_person || '—'}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(fac)}
                            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Редактировать"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Вы действительно хотите удалить объект «${fac.name}»?`)) {
                                onDelete(fac.id);
                              }
                            }}
                            className="p-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Удалить объект"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2 bg-red-600 rounded-xl shrink-0">
                  <Building2 className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg truncate">
                    {editingFacility ? 'Редактирование объекта' : 'Новый поднадзорный объект'}
                  </h3>
                  <p className="text-xs text-slate-400">ГПН МЧС России</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Наименование объекта *
                </label>
                <input
                  type="text"
                  required
                  placeholder="ТРЦ, школа, складской комплекс..."
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Фактический адрес *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Город, улица, номер дома/строения"
                  value={formData.address || ''}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Категория риска *
                  </label>
                  <select
                    value={formData.risk_level || 'Средний'}
                    onChange={(e) => setFormData({ ...formData, risk_level: e.target.value as RiskLevel })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer"
                  >
                    {RISK_LEVELS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Кадастровый номер
                  </label>
                  <input
                    type="text"
                    placeholder="77:01:0001001:1023"
                    value={formData.cadastral_number || ''}
                    onChange={(e) => setFormData({ ...formData, cadastral_number: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Ответственное лицо (ФИО / Должность)
                </label>
                <input
                  type="text"
                  placeholder="Иванов И.И., Главный инженер"
                  value={formData.responsible_person || ''}
                  onChange={(e) => setFormData({ ...formData, responsible_person: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{editingFacility ? 'Сохранить изменения' : 'Создать объект'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- EQUIPMENT PAGE COMPONENT (FULL CRUD WITH FACILITIES SELECT) ---
function EquipmentView({
  equipment,
  facilities,
  currentUser,
  onSave,
  onDelete
}: {
  equipment: Equipment[];
  facilities: Facility[];
  currentUser?: Inspector | null;
  onSave: (item: Partial<Equipment>) => void;
  onDelete: (id: number) => void;
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Equipment | null>(null);
  const [modalError, setModalError] = useState('');

  const isAdmin = isUserAdmin(currentUser);

  // Form state
  const [formData, setFormData] = useState<Partial<Equipment>>({
    facility_id: facilities[0]?.id || 1,
    type: '',
    serial_number: '',
    status: 'Исправен',
    last_check_date: getTodayDateString(),
    notes: ''
  });

  const facilitiesMap = useMemo(
    () => Object.fromEntries(facilities.map((f) => [f.id, f])),
    [facilities]
  );

  const openAddModal = () => {
    setEditingItem(null);
    setModalError('');
    setFormData({
      facility_id: facilities[0]?.id || 1,
      type: '',
      serial_number: '',
      status: 'Исправен',
      last_check_date: getTodayDateString(),
      notes: ''
    });
    setIsModalOpen(true);
  };

  const openEditModal = (item: Equipment) => {
    setEditingItem(item);
    setModalError('');
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (!formData.facility_id) {
      setModalError('Пожалуйста, выберите объект защиты для привязки оборудования');
      return;
    }

    if (isFutureDate(formData.last_check_date)) {
      setModalError('Дата проверки/ТО не может быть в будущем времени (максимально допустимая дата — сегодня)');
      return;
    }

    onSave(formData);
    setIsModalOpen(false);
  };

  const filteredEquipment = useMemo(() => {
    return equipment.filter((eq) => {
      const facilityName = facilitiesMap[eq.facility_id]?.name || '';
      const matchSearch =
        eq.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
        facilityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (eq.serial_number && eq.serial_number.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchFacility =
        facilityFilter === 'all' || eq.facility_id === Number(facilityFilter);

      const matchStatus = statusFilter === 'all' || eq.status === statusFilter;

      return matchSearch && matchFacility && matchStatus;
    });
  }, [equipment, searchTerm, facilityFilter, statusFilter, facilitiesMap]);

  // Quick preset equipment types
  const EQUIPMENT_PRESETS = [
    'Огнетушитель порошковый ОП-5 (з)',
    'Огнетушитель углекислотный ОУ-3',
    'Пожарная сигнализация «Болид» АСПС',
    'Пожарный кран ПК-50 в сборе',
    'Дренчерная система пожаротушения',
    'Система оповещения и управления эвакуацией (СОУЭ)',
    'Система противодымной вентиляции (ДУ)',
    'Пожарный гидрант ПГ-100'
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Wrench className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Оборудование и СИЗ</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Реестр противопожарного оборудования
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Учет огнетушителей, систем сигнализации, пожарных кранов и автоматики с привязкой к объектам
          </p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          Добавить оборудование
        </button>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col lg:flex-row gap-3 items-center justify-between">
        <div className="relative w-full lg:w-96">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Поиск по названию, объекту, заводскому номеру..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          {/* Facility Filter */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={facilityFilter}
              onChange={(e) => setFacilityFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer max-w-[220px] truncate"
            >
              <option value="all">Все объекты ({facilities.length})</option>
              {facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer"
            >
              <option value="all">Все статусы ({equipment.length})</option>
              {EQUIPMENT_STATUSES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Main Equipment Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200/80">
              <tr>
                {isAdmin && <th className="px-6 py-4">ID (Админ)</th>}
                <th className="px-6 py-4">Название / Тип оборудования</th>
                <th className="px-6 py-4">Объект привязки</th>
                <th className="px-6 py-4">Статус</th>
                <th className="px-6 py-4">Дата последней проверки</th>
                <th className="px-6 py-4 text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredEquipment.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Оборудование не найдено. Нажмите «Добавить оборудование», чтобы внести первую запись.
                  </td>
                </tr>
              ) : (
                filteredEquipment.map((item) => {
                  const facility = facilitiesMap[item.facility_id];
                  const statusStyle = getEquipmentStatusBadge(item.status);
                  const StatusIcon = statusStyle.icon;

                  return (
                    <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                      {isAdmin && (
                        <td className="px-6 py-4 font-mono text-xs text-slate-500 font-bold">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                            #{item.id}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900 flex items-center gap-2">
                          <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{item.type}</span>
                        </div>
                        {item.serial_number && (
                          <div className="text-[11px] font-mono text-slate-400 ml-5.5">
                            Зав./Инв. №: {item.serial_number}
                          </div>
                        )}
                        {item.notes && (
                          <div className="text-xs text-slate-500 mt-1 italic ml-5.5">
                            Примечание: {item.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>{facility?.name || (isAdmin ? `Объект ID #${item.facility_id}` : 'Поднадзорный объект')}</span>
                        </div>
                        <div className="text-xs text-slate-400 ml-5">
                          {facility?.address || 'Адрес не указан'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusStyle.bg}`}
                        >
                          <StatusIcon className="w-3.5 h-3.5" />
                          <span>{item.status}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-700 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-400" />
                          <span>{item.last_check_date}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                            title="Редактировать оборудование"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Вы уверены, что хотите удалить «${item.type}»?`)) {
                                onDelete(item.id);
                              }
                            }}
                            className="p-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Удалить оборудование"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: ADD / EDIT EQUIPMENT (WITH OBJECT SELECT) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-red-600 rounded-xl shrink-0">
                  <Wrench className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg truncate">
                    {editingItem ? 'Редактировать оборудование' : 'Добавить оборудование'}
                  </h3>
                  <p className="text-xs text-slate-400">Привязка к поднадзорному объекту</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2.5 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Facility Select Dropdown */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Объект привязки *
                </label>
                <select
                  required
                  value={formData.facility_id || ''}
                  onChange={(e) => setFormData({ ...formData, facility_id: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 cursor-pointer font-medium"
                >
                  <option value="" disabled>-- Выберите объект защиты --</option>
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.address})
                    </option>
                  ))}
                </select>
              </div>

              {/* Equipment Type & Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Название / Тип оборудования *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Огнетушитель, сигнализация, гидрант..."
                  value={formData.type || ''}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                />
                {/* Quick Presets Pills */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {EQUIPMENT_PRESETS.slice(0, 4).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: preset })}
                      className="text-[10px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                    >
                      + {preset.split(' ')[0]} {preset.split(' ')[1]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Status */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Текущий статус *
                  </label>
                  <select
                    value={formData.status || 'Исправен'}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as EquipmentStatus })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer font-medium"
                  >
                    {EQUIPMENT_STATUSES.map((st) => (
                      <option key={st} value={st}>{st}</option>
                    ))}
                  </select>
                </div>

                {/* Serial Number */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Заводской / Инв. номер
                  </label>
                  <input
                    type="text"
                    placeholder="ОП-8412 или SN-099"
                    value={formData.serial_number || ''}
                    onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                </div>
              </div>

              {/* Last Check Date with future date prevention */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Дата последней проверки / ТО *
                </label>
                <input
                  type="date"
                  required
                  max={getTodayDateString()}
                  value={formData.last_check_date || ''}
                  onChange={(e) => setFormData({ ...formData, last_check_date: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 font-medium"
                />
                <p className="text-[11px] text-slate-400 mt-1">Проверка даты: указание будущего числа недопустимо</p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Примечания / Результаты испытаний
                </label>
                <textarea
                  rows={2}
                  placeholder="Состояние манометра, пломбы, необходимость перезарядки..."
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 resize-none"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 transition-all flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{editingItem ? 'Сохранить изменения' : 'Добавить запись'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- INSPECTIONS JOURNAL COMPONENT ---
function InspectionsView({
  inspections,
  facilities,
  inspectors,
  currentUser,
  currentInspectorId,
  onSave,
  onDelete
}: {
  inspections: Inspection[];
  facilities: Facility[];
  inspectors: Inspector[];
  currentUser?: Inspector | null;
  currentInspectorId?: number;
  onSave: (item: Partial<Inspection>) => void;
  onDelete?: (id: number) => void;
}) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [modalError, setModalError] = useState('');

  const isAdmin = isUserAdmin(currentUser);

  const [formData, setFormData] = useState<Partial<Inspection>>({
    facility_id: facilities[0]?.id || 1,
    inspector_id: currentInspectorId || inspectors[0]?.id || 1,
    date: getTodayDateString(),
    result: 'Пройдена',
    violations: '',
    prescription_number: ''
  });

  const facilitiesMap = useMemo(
    () => Object.fromEntries(facilities.map((f) => [f.id, f])),
    [facilities]
  );
  const inspectorsMap = useMemo(
    () => Object.fromEntries(inspectors.map((i) => [i.id, i])),
    [inspectors]
  );

  const openAddModal = () => {
    setModalError('');
    setFormData({
      facility_id: facilities[0]?.id || 1,
      inspector_id: currentInspectorId || inspectors[0]?.id || 1,
      date: getTodayDateString(),
      result: 'Пройдена',
      violations: '',
      prescription_number: `ПР-${new Date().getFullYear().toString().slice(2)}/${Math.floor(Math.random() * 900 + 100)}`
    });
    setIsModalOpen(true);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    if (isFutureDate(formData.date)) {
      setModalError('Дата контрольного мероприятия не может быть в будущем времени (максимально допустимая дата — сегодня)');
      return;
    }

    onSave(formData);
    setIsModalOpen(false);
  };

  const filteredInspections = useMemo(() => {
    return inspections.filter((insp) => {
      const facilityName = facilitiesMap[insp.facility_id]?.name || '';
      const inspectorName = inspectorsMap[insp.inspector_id]?.full_name || '';
      const matchSearch =
        facilityName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inspectorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (insp.violations && insp.violations.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchResult = resultFilter === 'all' || insp.result === resultFilter;
      return matchSearch && matchResult;
    });
  }, [inspections, searchTerm, resultFilter, facilitiesMap, inspectorsMap]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-rose-600 mb-1">
            <ClipboardCheck className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Государственный надзор</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Журнал проверок и инспекций</h2>
          <p className="text-xs text-slate-500 mt-0.5">Учет выездных контрольных мероприятий, предписаний и выявленных нарушений</p>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          Внести проверку
        </button>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Поиск по объекту, инспектору, нарушениям..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-red-500/20 cursor-pointer"
          >
            <option value="all">Все результаты ({inspections.length})</option>
            <option value="Пройдена">Только пройденные</option>
            <option value="Не пройдена">С нарушениями (Не пройдена)</option>
          </select>
        </div>
      </div>

      {/* Inspections Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50/80 text-slate-600 text-xs font-bold uppercase tracking-wider border-b border-slate-200/80">
              <tr>
                {isAdmin && <th className="px-6 py-4">ID (Админ)</th>}
                <th className="px-6 py-4">Дата / Акт</th>
                <th className="px-6 py-4">Объект надзора</th>
                <th className="px-6 py-4">Инспектор ГПН</th>
                <th className="px-6 py-4">Результат</th>
                <th className="px-6 py-4">Выявленные нарушения</th>
                {isAdmin && <th className="px-6 py-4 text-right">Действия</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredInspections.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 6 : 5} className="px-6 py-12 text-center text-slate-400 text-xs">
                    Записи проверок не найдены.
                  </td>
                </tr>
              ) : (
                filteredInspections.map((insp) => {
                  const facility = facilitiesMap[insp.facility_id];
                  const inspector = inspectorsMap[insp.inspector_id];
                  const isPassed = insp.result === 'Пройдена';

                  return (
                    <tr key={insp.id} className="hover:bg-slate-50/60 transition-colors">
                      {isAdmin && (
                        <td className="px-6 py-4 font-mono text-xs text-slate-500 font-bold">
                          <span className="px-2 py-0.5 bg-slate-100 rounded-md border border-slate-200">
                            #{insp.id}
                          </span>
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">{insp.date}</div>
                        {insp.prescription_number && (
                          <div className="text-[11px] font-mono text-slate-400 font-medium">
                            {insp.prescription_number}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{facility?.name || (isAdmin ? `Объект #${insp.facility_id}` : 'Поднадзорный объект')}</div>
                        <div className="text-xs text-slate-400">{facility?.address}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-semibold text-slate-800">{inspector?.full_name || (isAdmin ? `Инспектор #${insp.inspector_id}` : 'Инспектор')}</div>
                        <div className="text-xs text-slate-400">{inspector?.rank}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${
                            isPassed
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {isPassed ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                          )}
                          <span>{insp.result}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 text-xs text-slate-600 max-w-xs">
                        {insp.violations ? (
                          <span className="text-rose-700 bg-rose-50/60 p-2 rounded-lg border border-rose-100 block">
                            {insp.violations}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Нарушений требований ПБ не выявлено</span>
                        )}
                      </td>
                      {isAdmin && (
                        <td className="px-6 py-4 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Вы действительно хотите удалить запись проверки объекта «${facility?.name || insp.facility_id}» от ${insp.date}?`)) {
                                onDelete?.(insp.id);
                              }
                            }}
                            className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Удалить запись проверки"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add Inspection */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-red-600 rounded-xl shrink-0">
                  <ClipboardCheck className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg truncate">Внесение результатов проверки</h3>
                  <p className="text-xs text-slate-400">Оформление акта надзорного мероприятия</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2.5 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Объект проверки *
                </label>
                <select
                  required
                  value={formData.facility_id || ''}
                  onChange={(e) => setFormData({ ...formData, facility_id: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium cursor-pointer"
                >
                  {facilities.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.address})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Дата проведения *
                  </label>
                  <input
                    type="date"
                    required
                    max={getTodayDateString()}
                    value={formData.date || ''}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Проверка даты: указание будущего числа недопустимо</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Результат проверки *
                  </label>
                  <select
                    value={formData.result || 'Пройдена'}
                    onChange={(e) => setFormData({ ...formData, result: e.target.value as InspectionResult })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium cursor-pointer"
                  >
                    <option value="Пройдена">Пройдена (Без нарушений)</option>
                    <option value="Не пройдена">Не пройдена (Выявлены нарушения)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Инспектор *
                </label>
                <select
                  value={formData.inspector_id || ''}
                  onChange={(e) => setFormData({ ...formData, inspector_id: Number(e.target.value) })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium cursor-pointer"
                >
                  {inspectors.map((insp) => (
                    <option key={insp.id} value={insp.id}>
                      {insp.full_name} ({insp.rank})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Номер предписания / Акта
                </label>
                <input
                  type="text"
                  placeholder="ПР-24/014"
                  value={formData.prescription_number || ''}
                  onChange={(e) => setFormData({ ...formData, prescription_number: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Описание нарушений (если выявлены)
                </label>
                <textarea
                  rows={3}
                  placeholder="Заблокирован запасный выход, неисправны пожарные гидранты..."
                  value={formData.violations || ''}
                  onChange={(e) => setFormData({ ...formData, violations: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 resize-none"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Сохранить в журнал
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- INSPECTORS COMPONENT ---
function InspectorsView({
  inspectors,
  currentUser,
  onSave,
  onDelete
}: {
  inspectors: Inspector[];
  currentUser: Inspector | null;
  onSave?: (inspector: Partial<Inspector>) => void;
  onDelete?: (id: number) => void;
}) {
  const [search, setSearch] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalError, setModalError] = useState('');
  const [formData, setFormData] = useState<Partial<Inspector>>({
    full_name: '',
    rank: 'Лейтенант внутренней службы',
    phone: '',
    email: '',
    role: 'Инспектор'
  });

  const isAdmin = isUserAdmin(currentUser);
  const isSenior = currentUser?.role === 'Старший инспектор';

  const filteredInspectors = useMemo(() => {
    return inspectors.filter((i) => {
      const matchSearch =
        i.full_name.toLowerCase().includes(search.toLowerCase()) ||
        i.rank.toLowerCase().includes(search.toLowerCase()) ||
        i.email.toLowerCase().includes(search.toLowerCase()) ||
        (i.phone && i.phone.includes(search));
      return matchSearch;
    });
  }, [inspectors, search]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModalError('');

    const trimmedEmail = (formData.email || '').trim();
    const trimmedName = (formData.full_name || '').trim();
    const trimmedPhone = (formData.phone || '').trim();

    if (!trimmedName) {
      setModalError('Укажите ФИО сотрудника');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setModalError('Укажите корректный служебный Email');
      return;
    }

    if (trimmedPhone && !isValidRussianPhone(trimmedPhone)) {
      setModalError('Укажите корректный номер телефона РФ (+7 (XXX) XXX-XX-XX или 8XXXXXXXXXX)');
      return;
    }

    // Check duplicate
    const isDuplicate = inspectors.some(
      (insp) => (!formData.id || insp.id !== formData.id) && insp.email.trim().toLowerCase() === trimmedEmail.toLowerCase()
    );

    if (isDuplicate) {
      setModalError(`Сотрудник с почтой "${trimmedEmail}" уже зарегистрирован в реестре`);
      return;
    }

    onSave?.({
      ...formData,
      full_name: trimmedName,
      email: trimmedEmail,
      phone: trimmedPhone ? normalizePhoneNumber(trimmedPhone) : '+7 (999) 000-00-00'
    });

    setIsModalOpen(false);
    setFormData({
      full_name: '',
      rank: 'Лейтенант внутренней службы',
      phone: '',
      email: '',
      role: 'Инспектор'
    });
  };

  const handleDeleteClick = (targetInspector: Inspector) => {
    if (!onDelete) return;

    if (!isAdmin) {
      alert('Ошибка доступа: Только Администратор системы имеет право удалять сотрудников из реестра.');
      return;
    }

    if (targetInspector.id === currentUser?.id) {
      alert('Невозможно удалить свой собственный активный аккаунт.');
      return;
    }

    if (inspectors.length <= 1) {
      alert('Невозможно удалить последнего сотрудника. В реестре должен оставаться как минимум один инспектор.');
      return;
    }

    const remainingAdmins = inspectors.filter(
      (i) => i.role === 'Администратор' && i.id !== targetInspector.id
    );

    if (targetInspector.role === 'Администратор' && remainingAdmins.length === 0) {
      alert('Невозможно удалить единственного Администратора системы. Назначьте другого администратора перед удалением.');
      return;
    }

    if (window.confirm(`Вы действительно хотите исключить инспектора «${targetInspector.full_name}» (${targetInspector.rank}) из реестра ГПН?`)) {
      onDelete(targetInspector.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
        <div>
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <Users className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Кадровый состав</span>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Инспекторы Государственного пожарного надзора</h2>
          <p className="text-xs text-slate-500 mt-0.5">Список аттестованных сотрудников ГПН МЧС России ({filteredInspectors.length} чел.)</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Поиск по ФИО, званию, почте..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
            />
          </div>

          {(isAdmin || isSenior) && (
            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-600/20 transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Добавить инспектора</span>
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredInspectors.map((inspector) => {
          const isSelf = inspector.id === currentUser?.id;
          const canDeleteThis = isAdmin && !isSelf;

          return (
            <div
              key={inspector.id}
              className={`bg-white rounded-2xl border ${
                isSelf ? 'border-red-300 ring-2 ring-red-500/10' : 'border-slate-200/80'
              } p-6 shadow-sm hover:shadow-lg transition-all flex flex-col justify-between`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-700 text-red-400 font-black text-sm flex items-center justify-center shadow-md">
                    {inspector.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                        inspector.role === 'Администратор'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : inspector.role === 'Старший инспектор'
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {inspector.role}
                    </span>
                    {isSelf && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-900 text-white">
                        Вы
                      </span>
                    )}
                    {canDeleteThis && onDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(inspector)}
                        title="Удалить из реестра"
                        className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <h3 className="text-lg font-bold text-slate-900 leading-snug">{inspector.full_name}</h3>
                  <p className="text-xs font-semibold text-red-600 mt-0.5">{inspector.rank}</p>
                </div>

                <div className="mt-5 space-y-2.5 pt-4 border-t border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-mono">{inspector.email}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{inspector.phone || 'Телефон не указан'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                <span>Статус: Действующий</span>
                <span className="text-emerald-600 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Аттестован
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal Add Inspector */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-fadeIn">
          <div className="bg-white rounded-2xl sm:rounded-3xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 sm:p-6 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="p-2.5 bg-red-600 rounded-xl shrink-0">
                  <Users className="w-5 h-5 text-white" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-base sm:text-lg truncate">Добавление инспектора ГПН</h3>
                  <p className="text-xs text-slate-400">Внесение сотрудника в кадровый состав реестра</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2.5 font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
                  <span>{modalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  ФИО инспектора *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Сергеев Алексей Викторович"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Специальное звание *
                  </label>
                  <select
                    value={formData.rank}
                    onChange={(e) => setFormData({ ...formData, rank: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium cursor-pointer"
                  >
                    <option value="Лейтенант внутренней службы">Лейтенант вн. сл.</option>
                    <option value="Старший лейтенант внутренней службы">Ст. лейтенант вн. сл.</option>
                    <option value="Капитан внутренней службы">Капитан вн. сл.</option>
                    <option value="Майор внутренней службы">Майор вн. сл.</option>
                    <option value="Подполковник внутренней службы">Подполковник вн. сл.</option>
                    <option value="Полковник внутренней службы">Полковник вн. сл.</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Роль доступа *
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as Role })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium cursor-pointer"
                  >
                    <option value="Инспектор">Инспектор</option>
                    <option value="Старший инспектор">Старший инспектор</option>
                    {isAdmin && <option value="Администратор">Администратор</option>}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Служебный Email *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="sergeev@mchs.gov.ru"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Контактный телефон
                  </label>
                  <input
                    type="tel"
                    placeholder="+7 (999) 555-44-33"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20 font-medium"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-md shadow-red-600/30 flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  Зарегистрировать сотрудника
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// --- PROFILE COMPONENT WITH 2FA MANAGEMENT & TOTP TOOLS ---
function ProfileView({
  currentUser,
  onUpdateUser
}: {
  currentUser: Inspector | null;
  onUpdateUser?: (updated: Inspector) => void;
}) {
  const [showPairModal, setShowPairModal] = useState(false);
  const [showInboxModal, setShowInboxModal] = useState(false);
  const [profileDeliveryResult, setProfileDeliveryResult] = useState<EmailDeliveryResult | null>(null);
  const [sendingTestMail, setSendingTestMail] = useState(false);
  const [testMailStatus, setTestMailStatus] = useState<string>('');
  const [smtpStatusInfo, setSmtpStatusInfo] = useState<SmtpStatus | null>(null);

  const [qrUrl, setQrUrl] = useState('');
  const [pairOtpUrl, setPairOtpUrl] = useState('');
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);
  const [testCode, setTestCode] = useState('');
  const [testResult, setTestResult] = useState<{ valid?: boolean; message?: string } | null>(null);

  // Live TOTP clock ticker
  const [remainingSec, setRemainingSec] = useState(getRemainingTOTPSeconds());
  const [liveCode, setLiveCode] = useState('------');

  const secret = currentUser?.two_factor_secret || (currentUser?.email ? getDeterministicInspectorSecret(currentUser.email) : '');
  const backupCodes = currentUser?.backup_codes && currentUser.backup_codes.length > 0
    ? currentUser.backup_codes
    : generateBackupRecoveryCodes(8);

  useEffect(() => {
    checkSmtpStatus().then((st) => setSmtpStatusInfo(st));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setRemainingSec(getRemainingTOTPSeconds());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (secret) {
      generateTOTPCode(secret).then((code) => setLiveCode(code));
    }
  }, [secret, remainingSec]);

  const handleSendProfileTestEmail = async () => {
    if (!currentUser?.email) return;
    setSendingTestMail(true);
    setTestMailStatus('');
    try {
      const res = await sendEmail2FACode(currentUser.email, currentUser.full_name);
      setProfileDeliveryResult(res);
      if (res.sentRealMail) {
        setTestMailStatus(`Письмо с кодом ${res.deliveryDetails?.code} успешно доставлено на ${currentUser.email} через SMTP!`);
      } else {
        setTestMailStatus(`Сформирован код ${res.deliveryDetails?.code} (откройте почтовый ящик инспектора для просмотра).`);
      }
    } catch (err: any) {
      setTestMailStatus(`Ошибка: ${err?.message || 'Не удалось отправить письмо'}`);
    } finally {
      setSendingTestMail(false);
    }
  };

  const handleOpenPairModal = async () => {
    if (!currentUser || !secret) return;
    const otpUrl = generateOtpAuthUrl(currentUser.email, secret, 'PozhNadzor');
    setPairOtpUrl(otpUrl);
    const url = await generateQrCodeDataUrl(otpUrl);
    setQrUrl(url);
    setShowPairModal(true);
  };

  const handleCopySecret = () => {
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const handleCopyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const handleRegenerateBackupCodes = () => {
    if (!currentUser) return;
    if (window.confirm('Сгенерировать 8 новых резервных кодов? Старые коды станут недействительными.')) {
      const freshCodes = generateBackupRecoveryCodes(8);
      const updated: Inspector = {
        ...currentUser,
        backup_codes: freshCodes
      };
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
    }
  };

  const handleVerifyTestCode = async () => {
    if (!secret) return;
    const clean = testCode.replace(/\D/g, '').trim();
    if (!clean || clean.length !== 6) {
      setTestResult({ valid: false, message: 'Введите 6 цифр' });
      return;
    }
    const res = await verifyTOTPCode(secret, clean, 30, 1);
    if (res.valid) {
      setTestResult({ valid: true, message: 'Успешно! Код подтвержден RFC 6238.' });
    } else {
      setTestResult({ valid: false, message: 'Неверный код. Проверьте время на телефоне.' });
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Profile Header */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm">
        <div className="flex flex-col sm:flex-row items-center gap-6 pb-6 border-b border-slate-100">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-tr from-slate-900 to-slate-800 text-red-400 font-black text-2xl flex items-center justify-center shadow-xl ring-4 ring-slate-100">
            {currentUser?.full_name?.split(' ').map((n) => n[0]).slice(0, 2).join('') || 'ГПН'}
          </div>
          <div className="text-center sm:text-left">
            <div className="inline-block px-3 py-1 bg-red-50 text-red-700 text-xs font-bold rounded-full border border-red-200 mb-1.5">
              {currentUser?.role || 'Инспектор ГПН'}
            </div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">
              {currentUser?.full_name || 'Сотрудник ГПН'}
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">
              {currentUser?.rank || 'Офицер внутренней службы'} · ГПН МЧС России
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Электронная почта</span>
            <p className="font-semibold text-slate-900 mt-1 font-mono text-sm">{currentUser?.email}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Служебный телефон</span>
            <p className="font-semibold text-slate-900 mt-1 text-sm">{currentUser?.phone || '+7 (999) 000-00-00'}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Служебное удостоверение</span>
            <p className="font-semibold text-slate-900 mt-1 text-sm">ГПН-МЧС № {currentUser?.id ? `77-${currentUser.id * 1042}` : '77-1042'}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Статус в системе</span>
            <p className="font-semibold text-emerald-700 mt-1 text-sm flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4" /> Авторизован (Полные права)
            </p>
          </div>
        </div>
      </div>

      {/* REAL EMAIL 2FA SECURITY CARD */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 text-red-600 rounded-2xl border border-red-200">
              <Mail className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  Реальная доставка 2FA на Email
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  АКТИВНО
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Отправка 6-значных кодов подтверждения на почту ({currentUser?.email})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowInboxModal(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Inbox className="w-4 h-4 text-red-600" />
              <span>Почтовый ящик</span>
            </button>
            <div className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-[11px] font-medium flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${smtpStatusInfo?.configured ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span>SMTP: <strong className="font-mono text-slate-800">smtp.config.json</strong></span>
            </div>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-800">Тестирование реальной отправки</p>
              <p className="text-[11px] text-slate-500">
                Отправить проверочный 2FA-код на адрес <strong className="text-slate-700">{currentUser?.email}</strong>
              </p>
            </div>

            <button
              type="button"
              disabled={sendingTestMail}
              onClick={handleSendProfileTestEmail}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-xs cursor-pointer active:scale-95 transition-all"
            >
              {sendingTestMail ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>{sendingTestMail ? 'Отправка...' : 'Отправить тестовый код'}</span>
            </button>
          </div>

          {testMailStatus && (
            <div className="p-3 rounded-xl text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{testMailStatus}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2FA TOTP (GOOGLE AUTHENTICATOR) SECURITY CARD */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-200">
              <ShieldCheck className="w-6 h-6 stroke-[2.2]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900">
                  Приложение аутентификатора (TOTP)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                  АКТИВНА
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Стандарт RFC 6238 TOTP (Google Authenticator, Яндекс Ключ, 2FAS)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenPairModal}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-amber-400" />
            <span>Подключить приложение</span>
          </button>
        </div>

        {/* Live Synchronizer & Verification tester */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Live TOTP Display */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-bold uppercase tracking-wider text-slate-700">Текущий TOTP-код:</span>
                <span className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">
                  <Timer className="w-3.5 h-3.5" /> {remainingSec} сек.
                </span>
              </div>
              <div className="text-3xl font-black font-mono tracking-widest text-slate-900 my-2">
                {liveCode}
              </div>
              <p className="text-[11px] text-slate-500 leading-tight">
                Код в приложении на телефоне должен совпадать с этим значением.
              </p>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
              <span className="text-[11px] font-mono text-slate-400 truncate max-w-[160px]">
                {secret}
              </span>
              <button
                type="button"
                onClick={handleCopySecret}
                className="text-[11px] font-bold text-slate-600 hover:text-red-600 flex items-center gap-1 cursor-pointer"
              >
                {copiedKey ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copiedKey ? 'Скопирован' : 'Ключ'}</span>
              </button>
            </div>
          </div>

          {/* Test Code Verification Box */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block mb-1">
                Проверить код с телефона:
              </span>
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="text"
                  maxLength={6}
                  placeholder="123456"
                  value={testCode}
                  onChange={(e) => setTestCode(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-center text-lg font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                />
                <button
                  type="button"
                  onClick={handleVerifyTestCode}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl cursor-pointer shrink-0"
                >
                  Тест
                </button>
              </div>
            </div>
            {testResult && (
              <div className={`mt-2 p-2 rounded-lg text-xs font-bold ${testResult.valid ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                {testResult.message}
              </div>
            )}
          </div>
        </div>

        {/* Emergency Backup Codes Box */}
        <div className="p-4 bg-amber-50/70 rounded-2xl border border-amber-200 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                <Key className="w-4 h-4 text-amber-600" /> Резервные коды восстановления ({backupCodes.length} шт.)
              </h4>
              <p className="text-[11px] text-amber-800 mt-0.5">
                Используются для входа, если у вас нет доступа к почте или приложению
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleCopyBackupCodes}
                className="px-2.5 py-1.5 bg-white border border-amber-300 text-amber-900 text-xs font-bold rounded-xl hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
              >
                {copiedCodes ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCodes ? 'Скопировано' : 'Скопировать'}</span>
              </button>
              <button
                type="button"
                onClick={() => currentUser && downloadBackupCodesAsTxt(currentUser.full_name, currentUser.email, backupCodes)}
                className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Скачать .txt</span>
              </button>
              <button
                type="button"
                onClick={handleRegenerateBackupCodes}
                className="px-2.5 py-1.5 bg-white border border-amber-300 text-amber-900 text-xs font-bold rounded-xl hover:bg-amber-100 flex items-center gap-1 cursor-pointer"
                title="Сгенерировать новые 8 кодов"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Сбросить</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-xs font-bold text-amber-950 bg-white/80 p-3 rounded-xl border border-amber-200/80 text-center">
            {backupCodes.map((c, i) => (
              <span key={i} className="bg-amber-100/60 py-1 rounded-lg">{c}</span>
            ))}
          </div>
        </div>
      </div>

      {/* QR PAIRING MODAL */}
      {showPairModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 animate-scaleUp">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-50 text-red-600 rounded-xl">
                  <QrCode className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-slate-900">
                  Подключение Authenticator
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 text-center space-y-4">
              <p className="text-xs text-slate-600">
                Отсканируйте этот QR-код в <span className="font-bold text-slate-800">Google Authenticator</span>, <span className="font-bold text-slate-800">Яндекс Ключ</span>, <span className="font-bold text-slate-800">2FAS</span> или <span className="font-bold text-slate-800">Apple Passwords</span>:
              </p>

              {qrUrl ? (
                <div className="inline-block p-3.5 bg-white border-2 border-slate-300 rounded-3xl shadow-sm">
                  <img src={qrUrl} alt="2FA QR Code" className="w-52 h-52 mx-auto rounded-2xl select-none" />
                  <span className="block text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-widest">
                    RFC 6238 TOTP
                  </span>
                </div>
              ) : (
                <div className="w-52 h-52 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center text-xs text-slate-400">
                  Генерация QR...
                </div>
              )}

              {pairOtpUrl && (
                <div>
                  <a
                    href={pairOtpUrl}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition-colors"
                  >
                    <span>Открыть прямо в приложении Authenticator</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl text-left space-y-1.5">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Либо введите секретный ключ вручную:
                </span>
                <div className="flex items-center justify-between font-mono text-xs font-bold text-slate-900 bg-white p-2.5 rounded-xl border border-slate-200">
                  <span className="break-all select-all text-red-700 font-black tracking-wide">
                    {formatSecretForDisplay(secret)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(sanitizeBase32(secret));
                      setCopiedKey(true);
                      setTimeout(() => setCopiedKey(false), 2000);
                    }}
                    className="px-2 py-1 text-slate-600 hover:text-red-600 cursor-pointer shrink-0 ml-2 font-sans text-xs font-bold flex items-center gap-1 border border-slate-200 rounded-lg hover:bg-slate-50"
                    title="Скопировать ключ без пробелов"
                  >
                    {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey ? 'Скопирован' : 'Ключ'}</span>
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">
                  Параметры: SHA-1 / 6 знаков / период 30 секунд
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowPairModal(false)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Готово
            </button>
          </div>
        </div>
      )}

      {/* INBOX MODAL */}
      <Email2FAInboxModal
        isOpen={showInboxModal}
        onClose={() => setShowInboxModal(false)}
        deliveryResult={profileDeliveryResult}
        cooldownSeconds={0}
        onResendEmail={handleSendProfileTestEmail}
        onApplyCode={() => {}}
      />
    </div>
  );
}

// --- MAIN APP COMPONENT ---
export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  // Application State with local persistent fallback (starts on AuthScreen by default if no stored session)
  const [kickedNotice, setKickedNotice] = useState<{ open: boolean; name: string }>({ open: false, name: '' });
  const [currentUser, setCurrentUser] = useState<Inspector | null>(() => {
    const saved = localStorage.getItem('current_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [facilities, setFacilities] = useState<Facility[]>(() => {
    const saved = localStorage.getItem('app_facilities');
    const parsed = saved ? JSON.parse(saved) : INITIAL_FACILITIES;
    return sanitizeLegacyIds(parsed);
  });

  const [inspectors, setInspectors] = useState<Inspector[]>(() => {
    const saved = localStorage.getItem('app_inspectors');
    const parsed = saved ? JSON.parse(saved) : INITIAL_INSPECTORS;
    return sanitizeLegacyIds(parsed);
  });

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => loadAuditLogs());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  useEffect(() => {
    saveAuditLogs(auditLogs);
  }, [auditLogs]);

  useEffect(() => {
    const handleNewAudit = (e: Event) => {
      const ce = e as CustomEvent<AuditLogEntry>;
      if (ce.detail) setAuditLogs((prev) => [ce.detail, ...prev]);
    };
    window.addEventListener('audit:new-entry', handleNewAudit);
    return () => window.removeEventListener('audit:new-entry', handleNewAudit);
  }, []);

  const logAudit = (action: AuditActionType, target: string, details?: string) => {
    const entry = createAuditEntry(currentUser, action, target, details);
    setAuditLogs((prev) => [entry, ...prev]);
  };

  const [equipment, setEquipment] = useState<Equipment[]>(() => {
    const saved = localStorage.getItem('app_equipment');
    const parsed = saved ? JSON.parse(saved) : INITIAL_EQUIPMENT;
    return sanitizeLegacyIds(parsed);
  });

  const [inspections, setInspections] = useState<Inspection[]>(() => {
    const saved = localStorage.getItem('app_inspections');
    const parsed = saved ? JSON.parse(saved) : INITIAL_INSPECTIONS;
    return sanitizeLegacyIds(parsed);
  });

  const [toast, setToast] = useState<string | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile drawer when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // Synchronize to localStorage
  useEffect(() => {
    localStorage.setItem('app_facilities', JSON.stringify(facilities));
  }, [facilities]);

  useEffect(() => {
    localStorage.setItem('app_inspectors', JSON.stringify(inspectors));
  }, [inspectors]);

  useEffect(() => {
    localStorage.setItem('app_equipment', JSON.stringify(equipment));
  }, [equipment]);

  useEffect(() => {
    localStorage.setItem('app_inspections', JSON.stringify(inspections));
  }, [inspections]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('current_user', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('current_user');
    }
  }, [currentUser]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3500);
  };

  // Try fetching from backend if running, otherwise keep state
    // Мониторинг в реальном времени: если текущего пользователя удалили из БД
  useEffect(() => {
    const checkActiveUser = async () => {
      const savedUser = localStorage.getItem('current_user') || localStorage.getItem('app_current_user');
      const activeUser = currentUser || (savedUser ? JSON.parse(savedUser) : null);
      if (!activeUser) return;
      if (isUserAdmin(activeUser)) return;

      try {
        const res = await api.get('/inspectors');
        if (Array.isArray(res.data) && res.data.length > 0) {
          const list = sanitizeLegacyIds(res.data);
          setInspectors(list);
          localStorage.setItem('app_inspectors', JSON.stringify(list));

          const userExists = list.some(
            (u: Inspector) =>
              u.id === activeUser.id ||
              String(u.id) === String(activeUser.id) ||
              (u.email && activeUser.email && u.email.trim().toLowerCase() === activeUser.email.trim().toLowerCase())
          );

          if (!userExists) {
            // Пользователя удалил Администратор!
            const userName = activeUser.full_name || 'Сотрудник';
            localStorage.removeItem('current_user');
            localStorage.removeItem('token');
            localStorage.removeItem('app_current_user');
            localStorage.removeItem('token_type');
            localStorage.removeItem('user');
            setCurrentUser(null);
            setAccessToken(null);
            setKickedNotice({ open: true, name: userName });
            navigate('/login');
          }
        }
      } catch {}
    };

    const loadBackendData = async () => {
      try {
        const [fRes, iRes, eqRes, inspRes] = await Promise.allSettled([
          api.get('/facilities'),
          api.get('/inspectors'),
          api.get('/equipment'),
          api.get('/inspections')
        ]);

        if (fRes.status === 'fulfilled' && Array.isArray(fRes.value.data)) {
          const list = sanitizeLegacyIds(fRes.value.data);
          setFacilities(list);
          localStorage.setItem('app_facilities', JSON.stringify(list));
        }
        if (iRes.status === 'fulfilled' && Array.isArray(iRes.value.data)) {
          const list = sanitizeLegacyIds(iRes.value.data);
          setInspectors(list);
          localStorage.setItem('app_inspectors', JSON.stringify(list));
          localStorage.setItem('inspectors_registry', JSON.stringify(list));
        }
        if (eqRes.status === 'fulfilled' && Array.isArray(eqRes.value.data)) {
          const list = sanitizeLegacyIds(eqRes.value.data);
          setEquipment(list);
          localStorage.setItem('app_equipment', JSON.stringify(list));
        }
        if (inspRes.status === 'fulfilled' && Array.isArray(inspRes.value.data)) {
          const list = sanitizeLegacyIds(inspRes.value.data);
          setInspections(list);
          localStorage.setItem('app_inspections', JSON.stringify(list));
        }
      } catch {}
    };

    loadBackendData();
    const pollInterval = setInterval(checkActiveUser, 2000);
    const syncInterval = setInterval(loadBackendData, 3000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(syncInterval);
    };
  }, [currentUser, navigate]);

  // Auth Handlers
  const handleLogin = (user: Inspector) => {
    setCurrentUser(user);
    setInspectors((prev) => {
      if (prev.some((i) => i.id === user.id || i.email.toLowerCase() === user.email.toLowerCase())) {
        return prev;
      }
      return [...prev, user];
    });
    showToast(`Добро пожаловать, ${user.full_name}!`);
    navigate('/');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setAccessToken(null);
    navigate('/login');
  };

  // Inspector Handlers
  const handleSaveInspector = async (inspData: Partial<Inspector>) => {
    try {
      if (inspData.id) {
        setInspectors((prev) =>
          prev.map((i) => (i.id === inspData.id ? ({ ...i, ...inspData } as Inspector) : i))
        );
        showToast('Данные инспектора обновлены');
      } else {
        const nextId = getNextSequentialId(inspectors);
        const newInsp: Inspector = {
          id: nextId,
          full_name: inspData.full_name || 'Новый Инспектор',
          rank: inspData.rank || 'Лейтенант внутренней службы',
          phone: inspData.phone || '+7 (999) 000-00-00',
          email: inspData.email || `inspector_${nextId}@mchs.gov.ru`,
          role: inspData.role || 'Инспектор'
        };
        try {
          const res = await api.post('/inspectors', {
            id: nextId,
            full_name: newInsp.full_name,
            rank: newInsp.rank,
            phone: newInsp.phone,
            role: newInsp.role,
            email: newInsp.email,
            password: 'password123',
            admin_code: newInsp.role === 'Администратор' ? 'ADMIN2026' : undefined
          });
          const created = res.data ? sanitizeLegacyIds([res.data])[0] : newInsp;
          setInspectors((prev) => [...prev.filter((x) => x.id !== created.id && x.email !== created.email), created]);
        } catch {
          setInspectors((prev) => [...prev, newInsp]);
        }
        showToast('Инспектор добавлен в реестр');
      }
    } catch {
      showToast('Ошибка при сохранении инспектора');
    }
  };

  const handleDeleteInspector = async (id: number) => {
    if (currentUser?.role !== 'Администратор') {
      showToast('Ошибка: Только Администратор может удалять сотрудников');
      return;
    }
    if (id === currentUser?.id) {
      showToast('Невозможно удалить свой собственный аккаунт');
      return;
    }
    const target = inspectors.find((i) => i.id === id);
    if (!target) return;

    const remainingAdmins = inspectors.filter((i) => i.role === 'Администратор' && i.id !== id);
    if (target?.role === 'Администратор' && remainingAdmins.length === 0) {
      showToast('Невозможно удалить единственного Администратора');
      return;
    }

    try {
      // 1. Отправляем запрос на бэкенд в базу PostgreSQL
      await api.delete(`/inspectors/${id}`);
      showToast('Инспектор успешно удален из базы данных');
    } catch (e) {
      try {
        await api.post('/inspectors/delete', { id, email: target.email });
        showToast('Инспектор успешно удален из базы данных');
      } catch (err) {
        console.error('Ошибка при удалении на сервере:', err);
        showToast('Инспектор исключен локально');
      }
    }

    // 2. Обновляем локальный стейт
    setInspectors((prev) => prev.filter((i) => i.id !== id));
  };

  // Facility Handlers
  const handleSaveFacility = async (facData: Partial<Facility>) => {
    try {
      if (facData.id) {
        // Update
        try {
          const res = await api.put(`/facilities/${facData.id}`, facData);
          setFacilities((prev) => prev.map((f) => (f.id === facData.id ? res.data : f)));
        } catch {
          setFacilities((prev) =>
            prev.map((f) => (f.id === facData.id ? ({ ...f, ...facData } as Facility) : f))
          );
        }
        showToast('Объект успешно обновлен');
      } else {
        // Create
        const nextId = getNextSequentialId(facilities);
        const newFacility: Facility = {
          id: nextId,
          name: facData.name || 'Новый объект',
          address: facData.address || '',
          risk_level: facData.risk_level || 'Средний',
          cadastral_number: facData.cadastral_number || '',
          responsible_person: facData.responsible_person || ''
        };
        try {
          const res = await api.post('/facilities', { ...facData, id: nextId });
          setFacilities((prev) => [...prev, res.data || newFacility]);
        } catch {
          setFacilities((prev) => [...prev, newFacility]);
        }
        showToast(`Новый объект #${nextId} добавлен в реестр`);
      }
    } catch (e) {
      showToast('Ошибка сохранения объекта');
    }
  };

  const handleDeleteFacility = async (id: number) => {
    try {
      try {
        await api.delete(`/facilities/${id}`);
      } catch {}
      setFacilities((prev) => prev.filter((f) => f.id !== id));
      // also cleanup equipment of this facility
      setEquipment((prev) => prev.filter((e) => e.facility_id !== id));
      showToast('Объект удален из реестра');
    } catch {
      showToast('Ошибка при удалении');
    }
  };

    // Equipment Handlers (FULL CRUD via PostgreSQL)
  const handleSaveEquipment = async (eqData: Partial<Equipment>) => {
    try {
      if (isFutureDate(eqData.last_check_date)) {
        showToast("Ошибка: Дата проверки не может быть в будущем времени");
        return;
      }

      const payload = {
        facility_id: Number(eqData.facility_id || facilities[0]?.id || 1),
        name: eqData.type || "Оборудование",
        type: eqData.type || "Оборудование",
        serial_number: eqData.serial_number || "",
        status: eqData.status || "Исправен",
        last_check_date: eqData.last_check_date || getTodayDateString(),
        notes: eqData.notes || ""
      };

      if (eqData.id) {
        // Update
        const res = await api.put(`/equipment/${eqData.id}`, payload);
        const updatedItem = res.data;
        setEquipment((prev) => {
          const list = prev.map((e) => (e.id === updatedItem.id ? updatedItem : e));
          localStorage.setItem("app_equipment", JSON.stringify(list));
          return list;
        });
        showToast("Оборудование успешно обновлено в базе данных!");
      } else {
        // Create
        const res = await api.post("/equipment", payload);
        const createdItem = res.data;
        setEquipment((prev) => {
          const list = [createdItem, ...prev.filter((e) => e.id !== createdItem.id)];
          localStorage.setItem("app_equipment", JSON.stringify(list));
          return list;
        });
        showToast(`Оборудование #${createdItem.id} успешно добавлено в базу данных!`);
      }
    } catch (err: any) {
      console.error("Ошибка сохранения оборудования:", err?.response?.data || err);
      showToast("Ошибка сохранения: " + (err?.response?.data?.detail || "Проверьте данные"));
    }
  };

  const handleDeleteEquipment = async (id: number) => {
    try {
      await api.delete(`/equipment/${id}`);
      setEquipment((prev) => {
        const updated = prev.filter((e) => e.id !== id);
        localStorage.setItem("app_equipment", JSON.stringify(updated));
        return updated;
      });
      showToast("Оборудование удалено из базы данных");
    } catch (err) {
      console.error("Ошибка при удалении оборудования:", err);
      showToast("Ошибка при удалении оборудования на сервере");
    }
  };

  const handleSaveInspection = async (inspData: Partial<Inspection>) => {
    try {
      if (isFutureDate(inspData.date)) {
        showToast("Ошибка: Дата проверки не может быть в будущем времени");
        return;
      }

      const payload = {
        facility_id: Number(inspData.facility_id),
        inspector_id: Number(inspData.inspector_id || currentUser?.id || 1),
        date: inspData.date || getTodayDateString(),
        result: inspData.result || "Пройдена",
        violations: inspData.violations || "",
        prescription_number: inspData.prescription_number || ""
      };

      const res = await api.post("/inspections", payload);
      const createdItem = res.data;

      setInspections((prev) => {
        const updated = [createdItem, ...prev.filter((i) => i.id !== createdItem.id)];
        localStorage.setItem("app_inspections", JSON.stringify(updated));
        return updated;
      });

      showToast(`Проверка #${createdItem.id} успешно сохранена в базу данных!`);
    } catch (err: any) {
      console.error("Ошибка сохранения проверки на сервере:", err?.response?.data || err);
      showToast("Ошибка сохранения: " + (err?.response?.data?.detail || "Проверьте данные"));
    }
  };

      const handleDeleteInspection = async (id: number) => {
    if (currentUser?.role !== 'Администратор') {
      showToast('Ошибка: Только Администратор может удалять проверки из журнала');
      return;
    }
    try {
      await api.delete(`/inspections/${id}`);
      setInspections((prev) => {
        const updated = prev.filter((i) => i.id !== id);
        localStorage.setItem('app_inspections', JSON.stringify(updated));
        return updated;
      });
      showToast('Запись проверки удалена из базы данных');
    } catch (err) {
      console.error(err);
      showToast('Ошибка удаления проверки на сервере');
    }
  };

  if (!currentUser) {
    return (
      <>
        <Routes>
          <Route
            path="/login"
            element={
              <AuthScreen
                onLogin={handleLogin}
                existingInspectors={inspectors}
              />
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>

        {kickedNotice.open && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
            <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-rose-100 p-6 text-center overflow-hidden">
              <div className="w-20 h-20 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100 shadow-inner">
                <span className="text-4xl">🚒</span>
              </div>
              <h3 className="text-2xl font-bold text-slate-900 mb-2">
                Упс, вас удалил Админ ;(
              </h3>
              <p className="text-sm text-slate-600 mb-4 leading-relaxed">
                Уважаемый <span className="font-semibold text-rose-600">{kickedNotice.name}</span>, не расстраивайтесь! 💔 
                Возможно, вы просто выполнили все нормативы пожарной безопасности досрочно или отправились на заслуженный отдых! 🌴🚒
              </p>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs text-slate-500 mb-6">
                Все данные профиля и активные сессии аннулированы в базе данных.
              </div>
              <button
                type="button"
                onClick={() => setKickedNotice({ open: false, name: '' })}
                className="w-full py-3 px-4 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white font-semibold rounded-xl shadow-lg transition-all cursor-pointer"
              >
                Понял, не унываю! 😄👍
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="flex h-screen
      <Toast /> w-screen bg-slate-100 overflow-hidden font-sans text-slate-800">
      {toast && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-800 text-xs font-bold flex items-center gap-2.5 animate-bounce">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{toast}</span>
        </div>
      )}

      <Sidebar
        currentUser={currentUser}
        onLogout={handleLogout}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-slate-100 relative">
        <header className="h-16 bg-white border-b border-slate-200/80 px-3.5 sm:px-6 flex items-center justify-between shrink-0 shadow-xs z-10">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors shrink-0 cursor-pointer"
              aria-label="Открыть меню"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 truncate">
                {location.pathname === '/' && 'Главная панель управления'}
                {location.pathname.startsWith('/facilities') && 'Реестр поднадзорных объектов'}
                {location.pathname.startsWith('/objects') && 'Реестр поднадзорных объектов'}
                {location.pathname.startsWith('/inspections') && 'Журнал проверок ГПН'}
                {location.pathname.startsWith('/inspectors') && 'Инспекторский состав ГПН'}
                {location.pathname.startsWith('/equipment') && 'Реестр оборудования и СИЗ'}
                {location.pathname.startsWith('/profile') && 'Служебный профиль'}
              </h1>
              <p className="text-[10px] text-slate-400 font-semibold lg:hidden truncate">
                ГПН МЧС России
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                exportFullDatabaseBackup({
                  facilities,
                  inspections,
                  equipment,
                  inspectors,
                  auditLogs
                });
                showToast('База данных успешно скачана (.json)');
              }}
              className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-xs"
              title="Скачать всю базу данных (JSON со всеми объектами, проверками, пользователями и аудитом)"
            >
              <Download className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Скачать всю БД</span>
              <span className="sm:hidden">Скачать БД</span>
            </button>

            <button
              type="button"
              onClick={() => setIsExportModalOpen(true)}
              className="flex items-center gap-1.5 bg-red-50 hover:bg-red-100 text-red-700 px-3 py-1.5 rounded-xl text-xs font-bold border border-red-200 transition-all cursor-pointer active:scale-95 shadow-xs"
              title="Управление резервными копиями БД (Экспорт, Выгрузка, Восстановление)"
            >
              <Database className="w-3.5 h-3.5 stroke-[2.5]" />
              <span className="hidden sm:inline">Бэкап и Восстановление</span>
              <span className="sm:hidden">Бэкап</span>
            </button>

            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>База данных ГПН</span>
            </div>
            <Link
              to="/profile"
              className="flex items-center gap-2 sm:gap-2.5 pl-2 sm:pl-3 border-l border-slate-200 hover:opacity-80 transition-opacity"
            >
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-900 leading-tight truncate max-w-[140px]">{currentUser.full_name}</p>
                <p className="text-[10px] text-slate-500 truncate max-w-[140px]">{currentUser.rank}</p>
              </div>
              <div className="w-8 h-8 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                {currentUser.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('')}
              </div>
            </Link>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6 lg:p-8 pb-24 lg:pb-8">
          <div className="max-w-7xl mx-auto">
            <Routes>
              <Route
                path="/"
                element={
                  <DashboardView
                    facilities={facilities}
                    inspectors={inspectors}
                    inspections={inspections}
                    equipment={equipment}
                  />
                }
              />
              <Route
                path="/facilities"
                element={
                  <FacilitiesView
                    facilities={facilities}
                    currentUser={currentUser}
                    canManage={isUserAdmin(currentUser) || currentUser.role === 'Старший инспектор'}
                    onSave={handleSaveFacility}
                    onDelete={handleDeleteFacility}
                  />
                }
              />
              <Route path="/objects" element={<Navigate to="/facilities" replace />} />
              <Route
                path="/inspections"
                element={
                  <InspectionsView
                    inspections={inspections}
                    facilities={facilities}
                    inspectors={inspectors}
                    currentUser={currentUser}
                    currentInspectorId={currentUser.id}
                    onSave={handleSaveInspection}
                    onDelete={handleDeleteInspection}
                  />
                }
              />
              <Route
                path="/inspectors"
                element={
                  <InspectorsView
                    inspectors={inspectors}
                    currentUser={currentUser}
                    onSave={handleSaveInspector}
                    onDelete={handleDeleteInspector}
                  />
                }
              />
              <Route
                path="/equipment"
                element={
                  <EquipmentView
                    equipment={equipment}
                    facilities={facilities}
                    currentUser={currentUser}
                    onSave={handleSaveEquipment}
                    onDelete={handleDeleteEquipment}
                  />
                }
              />
              <Route
                path="/profile"
                element={
                  <ProfileView
                    currentUser={currentUser}
                    onUpdateUser={(updated) => {
                      setCurrentUser(updated);
                      setInspectors((prev) =>
                        prev.map((insp) => (insp.id === updated.id ? updated : insp))
                      );
                      showToast('Настройки безопасности 2FA обновлены');
                    }}
                  />
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </div>

        <MobileBottomNav />
      </main>
      <ExportBackupModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} facilities={facilities} inspections={inspections} equipment={equipment} inspectors={inspectors} auditLogs={auditLogs} currentUser={currentUser} onAuditCreated={(entry) => setAuditLogs((prev) => [entry, ...prev])} showToast={showToast} />
    </div>
  );
}
