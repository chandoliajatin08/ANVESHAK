import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export const Banner = () => {
  const { loginWithGoogle, authError, setAuthError, loading } = useAuth();

  // 1. High-Priority Authentication Notice
  if (authError) {
    return (
      <aside
        aria-label="Authentication notice"
        className="bg-red-50 border-b border-red-200 px-4 py-2 text-xs font-mono text-red-900"
      >
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span className="font-bold text-red-700 uppercase">[AUTHENTICATION NOTICE]</span>
            <span className="text-red-800 truncate max-w-xl">{authError}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loginWithGoogle()}
              disabled={loading}
              className="px-2.5 py-0.5 rounded bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold text-[11px] font-sans transition-colors shadow-sm"
            >
              Retry Sign-In
            </button>
            <button
              onClick={() => setAuthError(null)}
              className="px-2 py-0.5 rounded bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-[11px] font-sans transition-colors shadow-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      </aside>
    );
  }

  // Live Hardware Feed: Keep interface clean, without redundant full-width banners
  return null;
};
