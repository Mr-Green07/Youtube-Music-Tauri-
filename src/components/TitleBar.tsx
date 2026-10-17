import React from "react";
import { Minus, Square, X, Music, UserCheck, ShieldAlert } from "lucide-react";
import { UserSession } from "../types/music";
import { minimizeApp, toggleMaximizeApp, closeOrHideApp } from "../services/tauriBridge";

interface TitleBarProps {
  session: UserSession;
  onOpenLogin: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ session, onOpenLogin }) => {
  return (
    <div
      data-tauri-drag-region
      className="h-10 w-full bg-[#09090b] border-b border-[#1c1c20] flex items-center justify-between px-3 select-none z-50 shrink-0"
    >
      {/* Left: Branding & Auth Status */}
      <div className="flex items-center space-x-3 pointer-events-auto">
        <div className="flex items-center space-x-2">
          <div className="w-5 h-5 rounded-full bg-red-600 flex items-center justify-center text-white shadow-sm shadow-red-900/50">
            <Music className="w-3 h-3 fill-current" />
          </div>
          <span className="text-xs font-semibold tracking-wider text-zinc-200">
            YT MUSIC <span className="text-[10px] text-zinc-500 font-normal">MINIMAL</span>
          </span>
        </div>

        <button
          onClick={onOpenLogin}
          className={`text-[11px] px-2 py-0.5 rounded-full flex items-center space-x-1.5 transition-colors border ${
            session.isAuthenticated
              ? "bg-zinc-900/90 text-zinc-300 border-zinc-700 hover:border-zinc-500"
              : "bg-red-950/40 text-red-400 border-red-900/50 hover:bg-red-900/30"
          }`}
          title={session.isAuthenticated ? `Logged in as ${session.displayName || session.userEmail}` : "Sign in via Google Account"}
        >
          {session.isAuthenticated ? (
            <>
              <UserCheck className="w-3 h-3 text-emerald-400" />
              <span className="truncate max-w-[120px]">{session.displayName || "Connected"}</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-3 h-3 text-red-400" />
              <span>Guest / Sign In</span>
            </>
          )}
        </button>
      </div>

      {/* Center Drag Region */}
      <div data-tauri-drag-region className="flex-1 h-full mx-4" />

      {/* Right: Window Controls */}
      <div className="flex items-center space-x-1 pointer-events-auto">
        <button
          onClick={minimizeApp}
          className="w-8 h-7 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded transition-colors"
          title="Minimize"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggleMaximizeApp}
          className="w-8 h-7 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/80 rounded transition-colors"
          title="Maximize / Restore"
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={closeOrHideApp}
          className="w-8 h-7 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-red-600 rounded transition-colors"
          title="Close / Minimize to Tray"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
