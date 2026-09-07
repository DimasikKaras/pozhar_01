import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// Изолированное хранилище токена в оперативной памяти и localStorage
let inMemoryAccessToken: string | null = null;
try {
  inMemoryAccessToken =
    localStorage.getItem('token') ||
    localStorage.getItem('access_token') ||
    null;
} catch {}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (error: any) => void;
}> = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else if (token) {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

export const setAccessToken = (token: string | null) => {
  inMemoryAccessToken = token;
  try {
    if (token) {
      localStorage.setItem('token', token);
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('access_token');
    }
  } catch {}
};

export const getAccessToken = (): string | null => {
  if (inMemoryAccessToken) return inMemoryAccessToken;
  try {
    return localStorage.getItem('token') || localStorage.getItem('access_token') || null;
  } catch {
    return null;
  }
};

export interface ApiErrorResponse {
  message?: string;
  detail?: string | Array<{ loc: string[]; msg: string; type: string }>;
  error_code?: string;
  status_code?: number;
}

export const getApiErrorMessage = (error: unknown, defaultMessage = 'Произошла непредвиденная ошибка'): string => {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<ApiErrorResponse>;
    if (axiosError.response?.data) {
      const data = axiosError.response.data;
      if (typeof data.detail === 'string') return data.detail;
      if (Array.isArray(data.detail) && data.detail.length > 0) return data.detail.map(d => d.msg).join(', ');
      if (data.message) return data.message;
    }
    if (axiosError.message === 'Network Error') {
      return 'Сетевая ошибка: проверьте подключение к защищенному серверу.';
    }
  }
  return defaultMessage;
};

const api = axios.create({
  baseURL: (import.meta as any).env?.VITE_API_URL || '/api',
  timeout: 15000,
  withCredentials: true,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let last401ToastTime = 0;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean; silent?: boolean };

    // Если запрос помечен как фоновый (X-Silent или silent), не выводим уведомления в UI
    const isSilent =
      originalRequest?.silent ||
      Boolean(originalRequest?.headers && (originalRequest.headers as any)['X-Silent']);

    if (isSilent) {
      return Promise.reject(error);
    }

    if (error.response?.status === 401 && !originalRequest?.url?.includes("/auth/login")) {
      const now = Date.now();
      const hasSavedUser = !!(
        localStorage.getItem('token') ||
        localStorage.getItem('current_user') ||
        localStorage.getItem('app_current_user')
      );
      // Ограничиваем частоту показа уведомления "Сессия истекла" (не чаще 1 раза в 15 секунд)
      if (hasSavedUser && now - last401ToastTime > 15000) {
        last401ToastTime = now;
        window.dispatchEvent(new CustomEvent("app_error", { detail: "Сессия истекла. Авторизуйтесь заново." }));
      }
    } else if (error.response?.status === 403) {
      window.dispatchEvent(new CustomEvent("app_error", { detail: "Ошибка 403: У вас нет прав для выполнения этого действия" }));
    } else if (error.response) {
      // Игнорируем сетевой шум 404
      if (error.response.status !== 404) {
        const data: any = error.response.data;
        const msg = data?.detail || `Ошибка сервера: ${error.response.status}`;
        window.dispatchEvent(new CustomEvent("app_error", { detail: typeof msg === "string" ? msg : "Ошибка сервера" }));
      }
    }

    return Promise.reject(error);
  }
);

export default api;
