import React, { useState, useEffect } from "react";

export default function Toast() {
  const [toasts, setToasts] = useState<{ id: number; message: string }[]>([]);

  useEffect(() => {
    const handleAppError = (event: any) => {
      const message = typeof event.detail === "string" ? event.detail : "Произошла ошибка";
      setToasts((prev) => {
        // Prevent duplicate messages from stacking up
        if (prev.some((t) => t.message === message)) {
          return prev;
        }
        const id = Date.now() + Math.random();
        // Cap max visible toasts to 3
        const updated = [...prev.slice(-2), { id, message }];
        setTimeout(() => {
          setToasts((current) => current.filter((t) => t.id !== id));
        }, 5000);
        return updated;
      });
    };

    window.addEventListener("app_error", handleAppError);
    return () => window.removeEventListener("app_error", handleAppError);
  }, []);

  const removeToast = (id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 999999,
        display: "flex",
        flexDirection: "column",
        gap: "10px"
      }}
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          style={{
            backgroundColor: "#dc2626",
            color: "#ffffff",
            padding: "12px 16px",
            borderRadius: "12px",
            boxShadow: "0 10px 25px rgba(0, 0, 0, 0.4)",
            fontSize: "13px",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: "10px",
            minWidth: "280px",
            maxWidth: "400px",
            border: "1px solid #ef4444"
          }}
        >
          <span>🚨</span>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            type="button"
            onClick={() => removeToast(t.id)}
            style={{
              background: "transparent",
              border: "none",
              color: "rgba(255, 255, 255, 0.8)",
              cursor: "pointer",
              fontSize: "16px",
              padding: "2px 6px",
              marginLeft: "4px"
            }}
            title="Закрыть"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
