import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class RootErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.href = '/login';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
          <div style={{ maxWidth: '480px', width: '100%', backgroundColor: '#ffffff', borderRadius: '20px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🚒</div>
            <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 8px' }}>
              Информационная система ГПН
            </h2>
            <p style={{ fontSize: '14px', color: '#e11d48', fontWeight: 600, margin: '0 0 12px' }}>
              Обнаружена ошибка инициализации интерфейса
            </p>
            <div style={{ backgroundColor: '#f1f5f9', padding: '12px', borderRadius: '10px', fontSize: '12px', color: '#475569', textAlign: 'left', wordBreak: 'break-word', maxHeight: '120px', overflowY: 'auto', marginBottom: '20px', fontFamily: 'monospace' }}>
              {this.state.error?.message || 'Неизвестная ошибка React'}
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ padding: '10px 18px', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '12px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Обновить страницу
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                style={{ padding: '10px 18px', backgroundColor: '#dc2626', color: '#ffffff', borderRadius: '12px', fontSize: '13px', fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Очистить кэш и войти
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </RootErrorBoundary>
  </React.StrictMode>
);
