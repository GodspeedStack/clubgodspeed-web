"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface Toast {
    id: string;
    message: string;
    type: ToastType;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (message: string, type: ToastType, duration?: number) => void;
    removeToast: (id: string) => void;
    success: (message: string, duration?: number) => void;
    error: (message: string, duration?: number) => void;
    info: (message: string, duration?: number) => void;
    warning: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback(
        (message: string, type: ToastType, duration: number = 4000) => {
            const id = `${Date.now()}-${Math.random()}`;
            const toast: Toast = { id, message, type, duration };

            setToasts((prev) => [...prev, toast]);

            // Auto-remove after duration
            if (duration > 0) {
                setTimeout(() => {
                    removeToast(id);
                }, duration);
            }
        },
        [removeToast]
    );

    const success = useCallback(
        (message: string, duration?: number) => addToast(message, "success", duration),
        [addToast]
    );

    const error = useCallback(
        (message: string, duration?: number) => addToast(message, "error", duration),
        [addToast]
    );

    const info = useCallback(
        (message: string, duration?: number) => addToast(message, "info", duration),
        [addToast]
    );

    const warning = useCallback(
        (message: string, duration?: number) => addToast(message, "warning", duration),
        [addToast]
    );

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, info, warning }}>
            {children}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error("useToast must be used within ToastProvider");
    }
    return context;
}
