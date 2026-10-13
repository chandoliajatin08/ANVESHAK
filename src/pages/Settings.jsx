import React, { useState, useEffect } from 'react';
import {
  Database,
  Sliders,
  Volume2,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Save,
  VolumeX,
  Lock,
  Radio,
  LogIn,
  Send,
  ShieldAlert,
  Copy,
  Check,
  Cpu,
} from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { useAuth } from '../context/AuthContext';
import {
  getStoredFirebaseConfig,
  saveFirebaseConfig,
  initFirebase,
  writeTestTelemetryPacket,
} from '../services/firebase';
import { soundEffects } from '../services/soundEffects';
import { Badge } from '../components/common/Badge';
import { DeviceStatus } from './DeviceStatus';

export const Settings = ({ initialTab = 'general', _onNavigate }) => {
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);
  const {
    thresholds,
    setThresholds,
    soundEnabled,
    setSoundEnabled,
  } = useTelemetry();

  const {
    user,
    loginWithGoogle,
    loginWithFirebase,
    loginDemoOperator,
    logout,
    authError,
  } = useAuth();

  // Firebase config form state
  const [fbConfig, setFbConfig] = useState(() => getStoredFirebaseConfig());
  const [saveStatus, setSaveStatus] = useState(null);
  const [testWriteStatus, setTestWriteStatus] = useState(null);
  const [copiedRules, setCopiedRules] = useState(false);

  // Local thresholds form state
  const [tempThresholds, setTempThresholds] = useState(thresholds);

  // Auth login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState(null);

  const handleSaveFirebaseConfig = (e) => {
    e.preventDefault();
    saveFirebaseConfig(fbConfig);
    const test = initFirebase(fbConfig);
    if (test.success) {
      setSaveStatus({
        type: 'success',
        msg: 'Firebase parameters saved and client verified successfully!',
      });
    } else {
      setSaveStatus({
        type: 'error',
        msg: test.error || 'Configuration saved, but could not connect.',
      });
    }
    setTimeout(() => setSaveStatus(null), 4000);
  };

  const handleTestWrite = async () => {
    setTestWriteStatus('Writing simulated test frame to /devices/ANVESHAK-ESP32-01/latest...');
    try {
      await writeTestTelemetryPacket();
      setTestWriteStatus('Success: Simulated test frame (marked isSimulated: true) published to Firebase!');
      setTimeout(() => setTestWriteStatus(null), 4000);
    } catch (err) {
      setTestWriteStatus(`Error: ${err.message}`);
      setTimeout(() => setTestWriteStatus(null), 5000);
    }
  };

  const handleSaveThresholds = (e) => {
    e.preventDefault();
    setThresholds(tempThresholds);
    setSaveStatus({ type: 'success', msg: 'Safety thresholds updated!' });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleResetThresholds = () => {
    const defaults = {
      gasWarning: 800,
      gasCritical: 1000,
      fallGForce: 2.5,
      tiltLimit: 45,
      overheatTemp: 45.0,
    };
    setTempThresholds(defaults);
    setThresholds(defaults);
    setSaveStatus({ type: 'success', msg: 'Reset thresholds to safety defaults.' });
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    const res = await loginWithFirebase(email, password);
    if (res.success) {
      setAuthSuccessMsg('Logged into Firebase successfully!');
      setTimeout(() => setAuthSuccessMsg(null), 3000);
    }
  };

  const handleGoogleLogin = async () => {
    const res = await loginWithGoogle();
    if (res.success) {
      setAuthSuccessMsg('Signed in with Google successfully!');
      setTimeout(() => setAuthSuccessMsg(null), 3000);
    }
  };

  const securityRulesSnippet = JSON.stringify(
    {
      rules: {
        devices: {
          "ANVESHAK-ESP32-01": {
            ".read": "auth != null",
            ".write": "auth != null"
          }
        }
      }
    },
    null,
    2
  );

  const copyRulesToClipboard = () => {
    navigator.clipboard.writeText(securityRulesSnippet);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-5xl">
      
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>Settings</span>
            <Badge variant="cyan" size="sm">
              CONTROL PANEL
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Account, display preferences, gas thresholds, and connection diagnostics.
          </p>
        </div>

        {saveStatus && (
          <div
            className={`px-3 py-1.5 rounded-lg text-xs font-mono flex items-center gap-2 ${
              saveStatus.type === 'success'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {saveStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{saveStatus.msg}</span>
          </div>
        )}
      </div>

      {/* Tabs Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('general')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'general'
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 shadow-sm font-bold'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>General & Thresholds</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('account')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'account'
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 shadow-sm font-bold'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Operator Account</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('firebase')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'firebase'
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 shadow-sm font-bold'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Firebase Connection</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('diagnostics')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
            activeTab === 'diagnostics'
              ? 'bg-cyan-50 text-cyan-700 border border-cyan-300 shadow-sm font-bold'
              : 'bg-white text-slate-600 border border-slate-200 hover:text-slate-900 hover:bg-slate-50'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>Device Diagnostics</span>
        </button>
      </div>

      {/* Tab 1: General & Safety Thresholds */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          {/* Telemetry Ingestion Pipeline Info */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Radio className="w-5 h-5 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Live Hardware Telemetry Feed</h2>
                  <p className="text-xs text-slate-500">
                    Production pipeline subscribed to physical ESP32 broadcasts in Firebase Realtime Database.
                  </p>
                </div>
              </div>
              <Badge variant="clean" size="xs">
                PRODUCTION PIPELINE ACTIVE
              </Badge>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Target Endpoint:</span>
                <code className="text-cyan-700 bg-cyan-50 px-1.5 py-0.5 rounded font-mono font-bold">/devices/ANVESHAK-ESP32-01/latest</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Firebase Project:</span>
                <span className="text-slate-800 font-mono font-medium">anveshak-live-monitor</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Heartbeat Timeout:</span>
                <span className="text-slate-800 font-mono">15,000 ms (truthful disconnect detection)</span>
              </div>
            </div>
          </div>

          {/* Safety Alert Thresholds Configuration */}
          <form onSubmit={handleSaveThresholds} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Sliders className="w-5 h-5 text-amber-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Sensor Safety Thresholds</h2>
                  <p className="text-xs text-slate-500">
                    Define the trigger levels that activate audio alerts and critical incident logs.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetThresholds}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 hover:text-slate-900 font-mono rounded bg-white hover:bg-slate-50 border border-slate-300 shadow-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
              {/* Gas Warning ADC */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="mq2-warn-range" className="font-bold text-slate-800">Gas & Smoke Warning (ADC)</label>
                  <span className="text-amber-600 font-bold">{tempThresholds.gasWarning} ADC</span>
                </div>
                <input
                  id="mq2-warn-range"
                  type="range"
                  min="600"
                  max="1200"
                  step="25"
                  value={tempThresholds.gasWarning}
                  onChange={(e) =>
                    setTempThresholds((p) => ({ ...p, gasWarning: Number(e.target.value) }))
                  }
                  className="w-full accent-amber-500"
                />
                <span className="text-[10px] text-slate-500 block">Baseline clean air is ~680 ADC</span>
              </div>

              {/* Gas Critical ADC */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="mq2-crit-range" className="font-bold text-slate-800">Gas & Smoke Critical (ADC)</label>
                  <span className="text-red-600 font-bold">{tempThresholds.gasCritical} ADC</span>
                </div>
                <input
                  id="mq2-crit-range"
                  type="range"
                  min="800"
                  max="3000"
                  step="25"
                  value={tempThresholds.gasCritical}
                  onChange={(e) =>
                    setTempThresholds((p) => ({ ...p, gasCritical: Number(e.target.value) }))
                  }
                  className="w-full accent-red-500"
                />
                <span className="text-[10px] text-slate-500 block">Hazardous gas leak alarm triggers at this level</span>
              </div>

              {/* Motion Fall Impact (g) */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="fall-impact-range" className="font-bold text-slate-800">Motion Sensor Fall Impact (G-Force)</label>
                  <span className="text-red-600 font-bold">{tempThresholds.fallGForce} g</span>
                </div>
                <input
                  id="fall-impact-range"
                  type="range"
                  min="1.5"
                  max="4.0"
                  step="0.1"
                  value={tempThresholds.fallGForce}
                  onChange={(e) =>
                    setTempThresholds((p) => ({ ...p, fallGForce: Number(e.target.value) }))
                  }
                  className="w-full accent-red-500"
                />
                <span className="text-[10px] text-slate-500 block">Triggers emergency fall classification</span>
              </div>

              {/* Motion Tilt Limit */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-center">
                  <label htmlFor="tilt-limit-range" className="font-bold text-slate-800">Motion Sensor Tilt Limit (Degrees)</label>
                  <span className="text-cyan-700 font-bold">{tempThresholds.tiltLimit}°</span>
                </div>
                <input
                  id="tilt-limit-range"
                  type="range"
                  min="25"
                  max="75"
                  step="5"
                  value={tempThresholds.tiltLimit}
                  onChange={(e) =>
                    setTempThresholds((p) => ({ ...p, tiltLimit: Number(e.target.value) }))
                  }
                  className="w-full accent-cyan-500"
                />
                <span className="text-[10px] text-slate-500 block">Posture tilt warning limit for roll / pitch</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>Save Thresholds</span>
              </button>
            </div>
          </form>

          {/* Audio & Alert Feedback Settings */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200">
              <Volume2 className="w-5 h-5 text-cyan-600" />
              <div>
                <h2 className="text-sm font-bold text-slate-900">Audio Alarm & Synthesizer Controls</h2>
                <p className="text-xs text-slate-500">
                  Web Audio API alert synthesis for audible notification during critical triggers.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-3 rounded-xl border transition-colors shadow-sm ${
                    soundEnabled
                      ? 'bg-cyan-50 border-cyan-300 text-cyan-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}
                >
                  {soundEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>
                <div>
                  <div className="text-sm font-bold text-slate-900">
                    {soundEnabled ? 'Audio Alerts Enabled' : 'Audio Alerts Muted'}
                  </div>
                  <div className="text-xs text-slate-500">
                    Synthesizes tone pulses for warning and sirens for critical emergencies.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 font-mono text-xs">
                <button
                  onClick={() => soundEffects.playWarningBeep()}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-amber-700 border border-slate-300 shadow-sm font-medium transition-colors"
                >
                  Test Warning Beep
                </button>
                <button
                  onClick={() => soundEffects.playCriticalAlarm()}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-red-600 border border-slate-300 shadow-sm font-medium transition-colors"
                >
                  Test Critical Siren
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Operator Account */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Lock className="w-5 h-5 text-cyan-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Operator Authentication</h2>
                  <p className="text-xs text-slate-500">
                    Active account: <span className="text-cyan-700 font-mono font-semibold">{user?.displayName}</span> ({user?.email})
                  </p>
                </div>
              </div>
              <Badge variant={user?.isGoogleUser ? 'clean' : user?.isDemoUser ? 'simulated' : 'clean'} size="xs">
                {user?.isGoogleUser ? 'GOOGLE AUTH' : user?.isDemoUser ? 'DEMO OPERATOR' : 'VERIFIED AUTH'}
              </Badge>
            </div>

            {authError && (
              <div className="p-2.5 rounded-lg bg-red-50 text-red-700 border border-red-200 text-xs font-mono">
                {authError}
              </div>
            )}
            {authSuccessMsg && (
              <div className="p-2.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-mono">
                {authSuccessMsg}
              </div>
            )}

            {/* Primary: Sign In with Google */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-slate-900 text-sm">Google Authentication</div>
                  <div className="text-xs text-slate-500">
                    Sign in with authorized Google account to read protected Realtime Database telemetry.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {!user?.isGoogleUser && !user?.isFirebaseUser ? (
                  <button
                    type="button"
                    onClick={handleGoogleLogin}
                    className="px-4 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-bold text-xs flex items-center gap-2 transition-all shadow-sm"
                  >
                    <span>Sign in with Google</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={logout}
                    className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm text-xs font-mono transition-colors"
                  >
                    Sign Out ({user.displayName})
                  </button>
                )}
              </div>
            </div>

            {/* Secondary: Email & Password Form */}
            <form onSubmit={handleAuthSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs pt-2">
              <input
                type="email"
                placeholder="operator@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-3 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
              />
              <button
                type="submit"
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm font-sans font-semibold transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Email Sign In</span>
              </button>
            </form>

            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-200">
              <span className="text-[11px] text-slate-500 font-mono">Quick Operator Roles:</span>
              <button
                type="button"
                onClick={() => loginDemoOperator('Lead Safety Officer')}
                className="px-3 py-1.5 text-xs rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm font-mono transition-colors"
              >
                Lead Safety Officer
              </button>
              <button
                type="button"
                onClick={() => loginDemoOperator('Field IoT Technician')}
                className="px-3 py-1.5 text-xs rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm font-mono transition-colors"
              >
                Field IoT Technician
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Firebase Parameters & Rules */}
      {activeTab === 'firebase' && (
        <div className="space-y-6">
          <form onSubmit={handleSaveFirebaseConfig} className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <Database className="w-5 h-5 text-cyan-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Firebase Realtime Database Project Parameters</h2>
                  <p className="text-xs text-slate-500">
                    Connected to Project <code className="text-cyan-700 bg-cyan-50 px-1 py-0.5 rounded font-bold font-mono">anveshak-live-monitor</code>
                  </p>
                </div>
              </div>
              <Badge variant={fbConfig.apiKey ? 'clean' : 'warning'} size="xs">
                {fbConfig.apiKey ? 'API KEY SET' : 'REQUIRES API KEY'}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 font-mono text-xs">
              <div>
                <label htmlFor="fb-api-key" className="block text-slate-600 mb-1 font-sans font-medium">
                  Web API Key (apiKey):
                </label>
                <input
                  id="fb-api-key"
                  type="text"
                  placeholder="AIzaSy..."
                  value={fbConfig.apiKey || ''}
                  onChange={(e) => setFbConfig((p) => ({ ...p, apiKey: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
                />
                <span className="text-[10px] text-slate-500 mt-1 block font-sans">
                  Found in Firebase Console → Project Settings → General → Web API Key
                </span>
              </div>

              <div>
                <label htmlFor="fb-rtdb-url" className="block text-slate-600 mb-1 font-sans font-medium">
                  Realtime Database URL (databaseURL):
                </label>
                <input
                  id="fb-rtdb-url"
                  type="text"
                  value={fbConfig.databaseURL || ''}
                  onChange={(e) => setFbConfig((p) => ({ ...p, databaseURL: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label htmlFor="fb-project-id" className="block text-slate-600 mb-1 font-sans font-medium">
                  Project ID (projectId):
                </label>
                <input
                  id="fb-project-id"
                  type="text"
                  value={fbConfig.projectId || ''}
                  onChange={(e) => setFbConfig((p) => ({ ...p, projectId: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>

              <div>
                <label htmlFor="fb-auth-domain" className="block text-slate-600 mb-1 font-sans font-medium">
                  Auth Domain (authDomain):
                </label>
                <input
                  id="fb-auth-domain"
                  type="text"
                  value={fbConfig.authDomain || ''}
                  onChange={(e) => setFbConfig((p) => ({ ...p, authDomain: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={handleTestWrite}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-mono font-semibold shadow-sm transition-colors"
                title="Write a simulated verification frame to test Firebase connectivity only"
              >
                <Send className="w-3.5 h-3.5" />
                <span>[Test Only] Write Simulated Verification Frame</span>
              </button>

              <button
                type="submit"
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold text-xs transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                <span>Save & Initialize Firebase</span>
              </button>
            </div>

            {testWriteStatus && (
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono text-cyan-800 shadow-sm">
                {testWriteStatus}
              </div>
            )}
          </form>

          {/* Non-Public Firebase Security Rules Guidance */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-amber-500" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Firebase Realtime Database Security Rules</h2>
                  <p className="text-xs text-slate-500">
                    To keep your database secure and prevent public read/write access:
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={copyRulesToClipboard}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm font-mono transition-colors font-medium"
              >
                {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-cyan-600" />}
                <span>{copiedRules ? 'Copied!' : 'Copy Rules'}</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed font-sans">
              Paste these rules into your <strong>Firebase Console → Realtime Database → Rules</strong> tab. This requires operators and devices to be authenticated and denies anonymous public crawling.
            </p>

            <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-cyan-300 font-mono text-xs overflow-x-auto shadow-sm">
              {securityRulesSnippet}
            </pre>
          </div>
        </div>
      )}

      {/* Tab 4: Device Diagnostics */}
      {activeTab === 'diagnostics' && (
        <div className="space-y-6">
          <DeviceStatus />
        </div>
      )}

    </div>
  );
};
