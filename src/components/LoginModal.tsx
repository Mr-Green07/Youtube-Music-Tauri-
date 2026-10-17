import React, { useState } from "react";
import { X, ShieldCheck, Lock, ExternalLink, LogOut, CheckCircle2 } from "lucide-react";
import { UserSession } from "../types/music";
import { openGoogleLogin, logoutUser } from "../services/tauriBridge";

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession;
  onSessionChange: (session: UserSession) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({
  isOpen,
  onClose,
  session,
  onSessionChange,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSignIn = async () => {
    setIsLoading(true);
    try {
      const newSession = await openGoogleLogin();
      onSessionChange(newSession);
    } catch (e) {
      console.error("Login failure:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await logoutUser();
      onSessionChange({ isAuthenticated: false });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none">
      <div className="w-full max-w-md bg-[#131317] border border-[#25252d] rounded-2xl shadow-2xl p-6 relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Security Badge */}
        <div className="flex items-center space-x-2 text-emerald-400 text-xs font-medium mb-3">
          <ShieldCheck className="w-4 h-4" />
          <span>Isolated WebView Authentication Loop</span>
        </div>

        <h3 className="text-base font-bold text-zinc-100 mb-1">
          {session.isAuthenticated ? "Google Account Connected" : "Sign In to YouTube Music"}
        </h3>
        <p className="text-xs text-zinc-400 mb-5 leading-relaxed">
          {session.isAuthenticated
            ? "Your YouTube Music session cookies are securely encrypted and stored locally. Token access is strictly scoped to youtube.com."
            : "Sign in using Google's secure login screen to access your library, playlists, and personalized algorithmic recommendations."}
        </p>

        {session.isAuthenticated ? (
          <div className="space-y-4">
            <div className="flex items-center space-x-3 p-3.5 bg-zinc-900/80 border border-zinc-800 rounded-xl">
              {session.avatarUrl ? (
                <img
                  src={session.avatarUrl}
                  alt="User Avatar"
                  className="w-10 h-10 rounded-full border border-zinc-700"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold text-white">
                  {(session.displayName || "U")[0]}
                </div>
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-zinc-200 truncate">
                  {session.displayName || "YouTube Music Listener"}
                </span>
                <span className="text-[11px] text-zinc-400 truncate">
                  {session.userEmail || "Google Account Connected"}
                </span>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                onClick={handleSignOut}
                disabled={isLoading}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-400 bg-red-950/30 hover:bg-red-950/60 border border-red-900/50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Disconnect Account</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-medium text-zinc-200 bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2 text-[11px] text-zinc-400 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800/80">
              <div className="flex items-center space-x-2">
                <Lock className="w-3.5 h-3.5 text-zinc-500" />
                <span>No credentials pass through unauthorized intermediaries</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-zinc-500" />
                <span>Cookie persistence scoped strictly to <code className="text-zinc-300">://youtube.com</code></span>
              </div>
            </div>

            <button
              onClick={handleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all shadow-md shadow-red-900/30 disabled:opacity-50"
            >
              <ExternalLink className="w-4 h-4" />
              <span>{isLoading ? "Connecting Secure WebView..." : "Open Google Login Window"}</span>
            </button>

            <button
              onClick={onClose}
              className="w-full py-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors text-center"
            >
              Continue in Guest Mode
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
