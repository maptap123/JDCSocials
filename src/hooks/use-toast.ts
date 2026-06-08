"use client";
import * as React from "react";

type ToastVariant = "default" | "destructive";
interface ToastData {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

const listeners: Array<(toasts: ToastData[]) => void> = [];
let toasts: ToastData[] = [];

function dispatch(toast: ToastData) {
  toasts = [toast, ...toasts].slice(0, 5);
  listeners.forEach((l) => l([...toasts]));
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== toast.id);
    listeners.forEach((l) => l([...toasts]));
  }, 4000);
}

export function toast(opts: Omit<ToastData, "id">) {
  dispatch({ ...opts, id: Math.random().toString(36).slice(2) });
}

export function useToast() {
  const [state, setState] = React.useState<ToastData[]>([...toasts]);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);
  return { toasts: state };
}
