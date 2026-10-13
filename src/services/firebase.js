/**
 * Firebase Client Service for ANVESHAK
 * Configured for project: anveshak-live-monitor
 * Realtime Database: https://anveshak-live-monitor-default-rtdb.asia-southeast1.firebasedatabase.app
 * Telemetry Node: /devices/ANVESHAK-ESP32-01/latest
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
} from 'firebase/auth';
import {
  getDatabase,
  ref,
  onValue,
  off,
  set,
  get,
  serverTimestamp,
} from 'firebase/database';

const STORAGE_KEY = 'anveshak_firebase_config';

export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'anveshak-live-monitor.firebaseapp.com',
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    'https://anveshak-live-monitor-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'anveshak-live-monitor',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'anveshak-live-monitor.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
};

export const getStoredFirebaseConfig = () => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Ensure authDomain is a valid domain and not localhost/127.0.0.1 which breaks OAuth
      const safeAuthDomain =
        parsed.authDomain &&
        parsed.authDomain.trim() &&
        !parsed.authDomain.includes('localhost') &&
        !parsed.authDomain.includes('127.0.0.1')
          ? parsed.authDomain.trim()
          : DEFAULT_FIREBASE_CONFIG.authDomain;

      return {
        ...DEFAULT_FIREBASE_CONFIG,
        ...parsed,
        // Fall back to environment defaults if stored fields are empty strings
        apiKey: (parsed.apiKey && parsed.apiKey.trim()) || DEFAULT_FIREBASE_CONFIG.apiKey,
        projectId: (parsed.projectId && parsed.projectId.trim()) || DEFAULT_FIREBASE_CONFIG.projectId,
        databaseURL: (parsed.databaseURL && parsed.databaseURL.trim()) || DEFAULT_FIREBASE_CONFIG.databaseURL,
        authDomain: safeAuthDomain,
        storageBucket: (parsed.storageBucket && parsed.storageBucket.trim()) || DEFAULT_FIREBASE_CONFIG.storageBucket,
      };
    }
  } catch (e) {
    console.error('Failed reading firebase config from localStorage:', e);
  }
  return DEFAULT_FIREBASE_CONFIG;
};

export const saveFirebaseConfig = (config) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
};

let appInstance = null;
let authInstance = null;
let dbInstance = null;

export const initFirebase = (config = null) => {
  const activeConfig = config || getStoredFirebaseConfig();

  // Validate minimum required fields
  if (!activeConfig.apiKey || !activeConfig.databaseURL) {
    return {
      success: false,
      error: 'Firebase Web API Key is missing. Please enter your Firebase API Key in Settings or set VITE_FIREBASE_API_KEY in .env.',
      app: null,
      auth: null,
      db: null,
    };
  }

  try {
    if (getApps().length > 0) {
      appInstance = getApp();
    } else {
      appInstance = initializeApp(activeConfig);
    }

    authInstance = getAuth(appInstance);
    dbInstance = getDatabase(appInstance);

    return {
      success: true,
      error: null,
      app: appInstance,
      auth: authInstance,
      db: dbInstance,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message || 'Error initializing Firebase SDK.',
      app: null,
      auth: null,
      db: null,
    };
  }
};

/**
 * Format Firebase Auth errors into clear, actionable messages
 */
export const formatAuthError = (err) => {
  if (!err) return 'An unknown error occurred.';
  const code = err.code || '';
  const message = err.message || '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in cancelled: The Google sign-in window was closed before completing authentication.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in cancelled: Another sign-in request was triggered or the popup was cancelled.';
    case 'auth/popup-blocked':
      return 'Sign-in popup was blocked by your browser. Please allow popups for this site and retry.';
    case 'auth/unauthorized-domain':
      return 'Domain not authorized: The current domain is not added to Authorized Domains in Firebase Console (Authentication > Settings > Authorized domains).';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is not enabled. Please enable Google in Firebase Console (Authentication > Sign-in method).';
    case 'auth/network-request-failed':
      return 'Network connection error: Unable to reach Firebase Authentication servers. Check your connection.';
    case 'auth/user-disabled':
      return 'This user account has been disabled in the Firebase Console.';
    case 'auth/user-token-expired':
      return 'Authentication session expired. Please sign in again.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Invalid email or password.';
    case 'auth/invalid-email':
      return 'Invalid email address format.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please wait a moment before trying again.';
    default:
      if (message.includes('popup-closed-by-user')) {
        return 'Sign-in cancelled: The Google sign-in window was closed before completing authentication.';
      }
      return message || 'Authentication failed.';
  }
};

/**
 * Sign in using Google OAuth Popup with seamless fallback to Redirect on popup-blocked
 */
export const signInWithGoogle = async () => {
  const config = getStoredFirebaseConfig();
  const fb = initFirebase(config);
  if (!fb.success || !fb.auth) {
    throw new Error(fb.error || 'Firebase is not initialized.');
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  try {
    // Attempt standard popup sign-in
    const result = await signInWithPopup(fb.auth, provider);
    return result;
  } catch (err) {
    // If browser popup blocker intercepts popup, fall back smoothly to redirect sign-in
    if (err.code === 'auth/popup-blocked') {
      try {
        await signInWithRedirect(fb.auth, provider);
        return { isRedirect: true };
      } catch (redirectErr) {
        const friendly = formatAuthError(redirectErr);
        const customErr = new Error(friendly);
        customErr.code = redirectErr.code;
        throw customErr;
      }
    }

    const friendly = formatAuthError(err);
    const customErr = new Error(friendly);
    customErr.code = err.code;
    throw customErr;
  }
};

/**
 * Handle redirect result when returning from Google redirect sign-in
 */
export const checkRedirectResult = async () => {
  const config = getStoredFirebaseConfig();
  const fb = initFirebase(config);
  if (!fb.success || !fb.auth) return null;

  try {
    const result = await getRedirectResult(fb.auth);
    return result;
  } catch (err) {
    const friendly = formatAuthError(err);
    const customErr = new Error(friendly);
    customErr.code = err.code;
    throw customErr;
  }
};

/**
 * Helper to write a test telemetry packet to /devices/ANVESHAK-ESP32-01/latest
 * Requires valid authenticated session under security rules
 */
export const writeTestTelemetryPacket = async (sampleData = null) => {
  const config = getStoredFirebaseConfig();
  const fb = initFirebase(config);
  if (!fb.success || !fb.db) {
    throw new Error(fb.error || 'Firebase database is not initialized.');
  }

  if (!fb.auth || !fb.auth.currentUser) {
    throw new Error('Authentication required: You must be signed in with Google or Email to publish telemetry to /devices/ANVESHAK-ESP32-01/latest.');
  }

  const targetRef = ref(fb.db, 'devices/ANVESHAK-ESP32-01/latest');
  const packet = sampleData || {
    timestamp: new Date().toISOString(),
    heartbeat: new Date().toISOString(),
    device: 'ANVESHAK-ESP32-01',
    isSimulated: true,
    isTestPacket: true,
    source: 'test-packet',
    esp32: {
      isOnline: true,
      rssi: -54,
      freeHeap: 184320,
      ipAddress: '192.168.1.185',
      macAddress: 'C4:4F:33:8A:2B:10',
      chipTemp: 41.2,
      uptimeSeconds: 1240,
    },
    mq2: {
      rawAdc: 785,
      ppm: null,
      voltage: 0.63,
    },
    mpu6050: {
      accel: { x: 0.05, y: -0.02, z: 0.99 },
      gyro: { x: 0.4, y: -0.2, z: 0.1 },
      tempC: 28.6,
      roll: -1,
      pitch: 3,
    },
    sosActive: false,
  };

  try {
    await set(targetRef, packet);
    return packet;
  } catch (err) {
    if (err.code === 'PERMISSION_DENIED') {
      const email = fb.auth.currentUser.email || fb.auth.currentUser.uid;
      throw new Error(`Permission denied: Authenticated user (${email}) was denied write access at /devices/ANVESHAK-ESP32-01/latest. Please verify Realtime Database Security Rules in the Firebase Console.`);
    }
    throw err;
  }
};

export const DEVICE_ID = 'ANVESHAK-ESP32-01';

export const DEVICE_PATHS = {
  metadata: `devices/${DEVICE_ID}/metadata`,
  latest: `devices/${DEVICE_ID}/latest`,
  history: `devices/${DEVICE_ID}/history`,
  alerts: `devices/${DEVICE_ID}/alerts`,
};

/**
 * Fetch historical log snapshots if available from Firebase RTDB
 */
export const fetchDeviceHistory = async () => {
  const config = getStoredFirebaseConfig();
  const fb = initFirebase(config);
  if (!fb.success || !fb.db || !fb.auth?.currentUser) return null;

  try {
    const historyRef = ref(fb.db, DEVICE_PATHS.history);
    const snap = await get(historyRef);
    return snap.exists() ? snap.val() : null;
  } catch (e) {
    console.warn('Could not read /devices/ANVESHAK-ESP32-01/history:', e);
    return null;
  }
};

/**
 * Update alert acknowledgement in Firebase RTDB
 */
export const acknowledgeAlertInFirebase = async (alertId) => {
  const config = getStoredFirebaseConfig();
  const fb = initFirebase(config);
  if (!fb.success || !fb.db || !fb.auth?.currentUser) return false;

  try {
    const targetRef = ref(fb.db, `${DEVICE_PATHS.alerts}/${alertId}/acknowledged`);
    await set(targetRef, true);
    return true;
  } catch (e) {
    console.warn('Could not update alert in Firebase:', e);
    return false;
  }
};

export {
  authInstance,
  dbInstance,
  ref,
  onValue,
  off,
  set,
  get,
  serverTimestamp,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
};
