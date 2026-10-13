import React from 'react';
import {
  Shield,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Menu,
  LogOut,
  Radio,
} from 'lucide-react';
import { useTelemetry } from '../../context/TelemetryContext';
import { useAuth } from '../../context/AuthContext';

export const Header = ({ onToggleMobileMenu }) => {
  const {
    streamPaused,
    setStreamPaused,
    soundEnabled,
    setSoundEnabled,
    deviceStatus,
  } = useTelemetry();

  const { user, loginWithGoogle, logout, loading } = useAuth();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 lg:px-6 py-2.5 shadow-sm">
      <div className="flex items-center justify-between gap-4 max-w-7xl mx-auto w-full">
        
        {/* Brand & Title */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="lg:hidden p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-600 text-white font-bold shadow-sm">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-base tracking-wider text-slate-900 font-sans">
                  ANVESHAK
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold">
                  Live Monitor
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center: Main Monitoring Device Connection Status */}
        <div className="hidden sm:flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-lg border text-xs font-semibold ${
              deviceStatus.level === 'critical'
                ? 'bg-red-50 border-red-200 text-red-700'
                : deviceStatus.level === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : deviceStatus.level === 'info'
                ? 'bg-sky-50 border-sky-200 text-sky-700'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            <span>
              {`Main Device: ${deviceStatus.displayLabel}`}
            </span>
          </div>
        </div>

        {/* Right: Controls & User Profile */}
        <div className="flex items-center gap-2.5">
          {/* Pause / Resume Live Stream */}
          <button
            onClick={() => setStreamPaused((p) => !p)}
            className={`p-1.5 rounded-lg border text-xs transition-colors shadow-sm ${
              streamPaused
                ? 'bg-amber-50 border-amber-300 text-amber-800'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
            title={streamPaused ? 'Resume live telemetry stream' : 'Pause live telemetry stream'}
            aria-label={streamPaused ? 'Resume live telemetry stream' : 'Pause live telemetry stream'}
          >
            {streamPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          {/* Sound Alert Toggle */}
          <button
            onClick={() => setSoundEnabled((s) => !s)}
            className={`p-1.5 rounded-lg border text-xs transition-colors shadow-sm ${
              soundEnabled
                ? 'bg-cyan-50 border-cyan-200 text-cyan-700 hover:bg-cyan-100'
                : 'bg-white border-slate-200 text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
            title={soundEnabled ? 'Mute alert audio' : 'Unmute alert audio'}
            aria-label={soundEnabled ? 'Mute alert audio' : 'Unmute alert audio'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* User Profile / Logout */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            {user?.isGoogleUser || user?.isFirebaseUser ? (
              <div className="flex items-center gap-2">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="w-7 h-7 rounded-full border border-slate-300 shadow-sm object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-cyan-100 border border-cyan-300 flex items-center justify-center text-cyan-800 font-bold text-xs shadow-sm">
                    {user.displayName?.[0] || 'U'}
                  </div>
                )}
                <div className="hidden md:block text-left text-xs font-mono">
                  <div className="font-semibold text-slate-800 truncate max-w-[120px]">
                    {user.displayName}
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold">
                    {user?.isGoogleUser ? 'Google Signed-In' : 'Verified'}
                  </div>
                </div>
                <button
                  onClick={logout}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 transition-colors"
                  title="Sign Out"
                  aria-label="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={loginWithGoogle}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-60 text-slate-700 border border-slate-300 text-xs font-medium shadow-sm transition-colors"
                title="Sign in with Google"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span className="hidden sm:inline">{loading ? 'Signing in...' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>

        </div>

      </div>
    </header>
  );
};
