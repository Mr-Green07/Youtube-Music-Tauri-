import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, X } from "lucide-react";
import { ToastKind, ToastMessage } from "../types/music";

/**
 * Ultra-light toast system (no dependency, no context provider).
 * Call `toast("Saved to Chill Mix")` from anywhere — including services.
 */

let sequence = 0;
let messages: ToastMessage[] = [];
const listeners = new Set<(next: ToastMessage[]) => void>();

function publish() {
  const snapshot = [...messages];
  listeners.forEach((listener) => listener(snapshot));
}

function dismiss(id: number) {
  messages = messages.filter((m) => m.id !== id);
  publish();
}

export function toast(text: string, kind: ToastKind = "success", ttlMs = 3200) {
  const message: ToastMessage = { id: ++sequence, text, kind };
  messages = [...messages.slice(-3), message];
  publish();
  window.setTimeout(() => dismiss(message.id), ttlMs);
  return message.id;
}

const KIND_STYLES: Record<ToastKind, { wrapper: string; icon: React.ReactNode }> = {
  success: {
    wrapper: "border-emerald-500/40 bg-emerald-950/80 text-emerald-100",
    icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
  },
  error: {
    wrapper: "border-red-500/40 bg-red-950/80 text-red-100",
    icon: <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />,
  },
  info: {
    wrapper: "border-zinc-600/50 bg-zinc-900/90 text-zinc-100",
    icon: <Info className="w-4 h-4 text-zinc-300 shrink-0" />,
  },
};

export const Toaster: React.FC = () => {
  const [items, setItems] = useState<ToastMessage[]>(messages);

  useEffect(() => {
    listeners.add(setItems);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[60] flex flex-col items-end space-y-2 pointer-events-none select-none">
      {items.map((item) => {
        const style = KIND_STYLES[item.kind];
        return (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center space-x-2 px-3 py-2 rounded-xl border backdrop-blur-md shadow-lg text-xs font-medium max-w-xs animate-[fadeIn_150ms_ease-out] ${style.wrapper}`}
          >
            {style.icon}
            <span className="flex-1 leading-snug">{item.text}</span>
            <button
              onClick={() => dismiss(item.id)}
              className="p-0.5 rounded text-white/50 hover:text-white transition-colors"
              aria-label="Dismiss notification"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
