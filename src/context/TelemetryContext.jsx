import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { soundEffects } from '../services/soundEffects';
import {
  initFirebase,
  getStoredFirebaseConfig,
  ref,
  onValue,
  off,
  acknowledgeAlertInFirebase,
} from '../services/firebase';
import { calculateGForce, getDeviceConnectionStatus } from '../utils/formatters';
import { useAuth } from './AuthContext';

const TelemetryContext = createContext();

const DEFAULT_THRESHOLDS = {
  gasWarning: 800,    // MQ-2 ADC Warning (800 - 999)
  gasCritical: 1000,   // MQ-2 ADC Critical (>=1000 triggers loud buzzer alarm)
  fallGForce: 2.5,     // G-force threshold
  tiltLimit: 45,       // Roll / pitch angle degrees
  overheatTemp: 45.0,  // °C
};

export const parseHardwarePacket = (val) => {
  const rawAdc = val.mq2?.rawAdc ?? val.mq2?.adc ?? val.gas_adc ?? val.gas ?? null;
  const voltage = val.mq2?.voltage ?? (rawAdc !== null ? Number(((rawAdc / 4095) * 3.3).toFixed(2)) : null);

  const ax = val.mpu6050?.accel?.x ?? val.mpu?.ax ?? val.ax ?? val.accelX ?? null;
  const ay = val.mpu6050?.accel?.y ?? val.mpu?.ay ?? val.ay ?? val.accelY ?? null;
  const az = val.mpu6050?.accel?.z ?? val.mpu?.az ?? val.az ?? val.accelZ ?? null;

  const gx = val.mpu6050?.gyro?.x ?? val.mpu?.gx ?? val.gx ?? val.gyroX ?? null;
  const gy = val.mpu6050?.gyro?.y ?? val.mpu?.gy ?? val.gy ?? val.gyroY ?? null;
  const gz = val.mpu6050?.gyro?.z ?? val.mpu?.gz ?? val.gz ?? val.gyroZ ?? null;

  const rawTemp = val.mpu6050?.tempC ?? val.mpu?.temp ?? val.temp ?? val.temperature ?? val.esp32?.chipTemp ?? null;
  const tempC = rawTemp !== null && !isNaN(Number(rawTemp)) ? Number(rawTemp) : null;

  const roll = val.mpu6050?.roll ?? val.mpu?.roll ?? (ax !== null && az !== null ? Math.round(Math.atan2(-ax, az) * (180 / Math.PI)) : 0);
  const pitch = val.mpu6050?.pitch ?? val.mpu?.pitch ?? (ay !== null && ax !== null && az !== null ? Math.round(Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI)) : 0);

  const isSimulated = Boolean(val.isSimulated || val.isTestPacket || val.source === 'test-packet');
  const source = isSimulated ? 'test-packet' : (val.source || 'hardware');

  return {
    timestamp: val.timestamp || new Date().toISOString(),
    heartbeat: val.heartbeat || val.timestamp || null,
    isSimulated,
    isTestPacket: isSimulated,
    source,
    seq: val.seq !== undefined && val.seq !== null ? Number(val.seq) : null,
    device: val.device || 'ANVESHAK-ESP32-01',
    esp32: {
      isOnline: val.esp32?.isOnline !== false,
      rssi: val.esp32?.rssi ?? val.rssi ?? null,
      freeHeap: val.esp32?.freeHeap ?? val.freeHeap ?? null,
      ipAddress: val.esp32?.ipAddress ?? val.ipAddress ?? val.ip ?? null,
      macAddress: val.esp32?.macAddress ?? val.macAddress ?? null,
      chipTemp: val.esp32?.chipTemp ?? null,
      uptimeSeconds: val.esp32?.uptimeSeconds ?? val.uptime ?? null,
    },
    status: val.status || null,   // NORMAL / WARNING / DANGER / FALL / SOS, decided on the helmet
    mq2: {
      rawAdc: rawAdc !== null ? Number(rawAdc) : null,
      voltage: voltage !== null ? Number(voltage) : null,
      ppm: val.mq2?.ppm !== undefined && val.mq2?.ppm !== null && Number(val.mq2.ppm) >= 0 ? Number(val.mq2.ppm) : null,
      calibrated: Boolean(val.mq2?.calibrated),
    },
    mq4: {
      enabled: Boolean(val.mq4?.enabled ?? (val.mq4?.rawAdc !== undefined && val.mq4?.rawAdc !== null)),
      rawAdc: val.mq4?.rawAdc !== undefined && val.mq4?.rawAdc !== null ? Number(val.mq4.rawAdc) : null,
      ppm: val.mq4?.ppm !== undefined && val.mq4?.ppm !== null && Number(val.mq4.ppm) >= 0 ? Number(val.mq4.ppm) : null,
      calibrated: Boolean(val.mq4?.calibrated),
    },
    mpu6050: {
      accel: {
        x: ax !== null ? Number(ax) : null,
        y: ay !== null ? Number(ay) : null,
        z: az !== null ? Number(az) : null,
      },
      gyro: {
        x: gx !== null ? Number(gx) : null,
        y: gy !== null ? Number(gy) : null,
        z: gz !== null ? Number(gz) : null,
      },
      tempC,
      roll: Number(roll),
      pitch: Number(pitch),
    },
    lora: {
      // true only when the packet really arrived over LoRa (never assumed)
      status: Boolean(val.lora?.status ?? false),
      moduleReady: Boolean(val.lora?.moduleReady ?? false),
      rssi: val.lora?.rssi ?? null,
      snr: val.lora?.snr ?? null,
      packetsReceived: val.lora?.packetsReceived ?? null,
      packetLossPct: val.lora?.packetLossPct ?? null,
    },
    // Real SOS button state only - no longer copied from the gas alarm
    sosActive: Boolean(val.sosActive ?? val.sos ?? false),
    fallDetected: Boolean(val.fallDetected),
    gasAlarm: Boolean(val.gasAlarm ?? val.alarmActive),
    gasLevel: val.gasLevel !== undefined && val.gasLevel !== null ? Number(val.gasLevel) : null, // 0 normal, 1 warning, 2 danger
    fallEvent: val.fallEvent ?? null,
    ai: val.ai ?? null,
  };
};

export const TelemetryProvider = ({ children }) => {
  const { firebaseUser, authReady } = useAuth();

  // Mode is strictly 'live' - Real hardware telemetry from Firebase
  const [mode, setMode] = useState('live');
  const [streamPaused, setStreamPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // Custom alert thresholds
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  // Latest Telemetry Packet - strictly null until authentic hardware data arrives
  const [latestPacket, setLatestPacket] = useState(null);

  // Rolling buffer for live charts - strictly populated by incoming hardware frames
  const [historyBuffer, setHistoryBuffer] = useState([]);

  // Alert Log - loaded from Firebase RTDB and active alerts
  const [alerts, setAlerts] = useState([]);
  // Time each alert type was last raised, so a continuing condition does not add a new alert every packet
  const lastAlertAtRef = useRef({});
  const ALERT_REPEAT_MS = 30000;

  // Live Firebase connection and device freshness state
  const [firebaseConnected, setFirebaseConnected] = useState(false);
  const [firebaseError, setFirebaseError] = useState(null);
  const [liveError, setLiveError] = useState(null);
  const [liveLastPacketTime, setLiveLastPacketTime] = useState(null);
  const [liveLoading, setLiveLoading] = useState(false);
  const [liveEmpty, setLiveEmpty] = useState(true);

  // Ticker for evaluating heartbeat age in real-time
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2000);
    return () => clearInterval(timer);
  }, []);

  // Reactive truthful device connection status (Waiting for Data | Device Online | Device Offline | Connection Error)
  const deviceStatus = getDeviceConnectionStatus({
    latestPacket,
    liveLastPacketTime,
    liveEmpty,
    liveLoading,
    liveError: liveError || firebaseError,
    now,
    timeoutMs: 15000,
  });

  // Sound effects sync
  useEffect(() => {
    soundEffects.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // Check alert conditions and sound alarms
  const evaluateAlerts = useCallback((packet) => {
    if (!packet || !packet.esp32?.isOnline) return;

    const newAlerts = [];
    const timestamp = packet.timestamp || new Date().toISOString();

    // 1. SOS button check
    if (packet.sosActive) {
      newAlerts.push({
        id: `sos_${Date.now()}`,
        type: 'SOS_EVENT',
        title: 'EMERGENCY SOS TRIGGERED',
        message: 'Physical SOS emergency trigger engaged on ESP32 device.',
        timestamp,
        severity: 'critical',
        acknowledged: false,
        sensor: 'SOS_BUTTON',
        sound: 'sos',
      });
    }

    // 1b. Fall detected on the helmet (free fall -> impact -> lying still)
    if (packet.fallDetected) {
      const conf = packet.ai?.fall?.confidence;
      newAlerts.push({
        id: `fall_${Date.now()}`,
        type: 'FALL_DETECTED',
        title: 'MINER FALL DETECTED',
        message: `Helmet confirmed a fall (impact + no movement + tilt)${conf !== null && conf !== undefined ? `, AI confidence ${Math.round(conf * 100)}%` : ''}.`,
        timestamp,
        severity: 'critical',
        acknowledged: false,
        sensor: 'MPU-6050',
        sound: 'critical',
      });
    }

    // 1c. AI gas prediction (warns before the danger level is reached)
    const gasAi = packet.ai?.gas;
    if (gasAi && gasAi.timeToDangerSec !== null && gasAi.timeToDangerSec !== undefined && gasAi.timeToDangerSec <= 300) {
      newAlerts.push({
        id: `gas_pred_${Date.now()}`,
        type: 'GAS_PREDICTION',
        title: 'AI: GAS RISING TOWARDS DANGER',
        message: `${gasAi.metric} rising ${gasAi.slopePerMin} ${gasAi.unit}/min. Danger level predicted in ~${Math.max(1, Math.round(gasAi.timeToDangerSec / 60))} min.`,
        timestamp,
        severity: 'warning',
        acknowledged: false,
        sensor: 'AI ENGINE',
        sound: 'warning',
      });
    }
    if (gasAi?.spike) {
      newAlerts.push({
        id: `gas_spike_${Date.now()}`,
        type: 'GAS_SPIKE',
        title: 'AI: SUDDEN GAS SPIKE',
        message: `${gasAi.metric} jumped far above its recent average (z-score ${gasAi.zScore}).`,
        timestamp,
        severity: 'warning',
        acknowledged: false,
        sensor: 'AI ENGINE',
        sound: 'warning',
      });
    }

    // 2. Gas threshold check (helmet status first, raw ADC thresholds as fallback)
    const adc = Math.max(packet.mq2?.rawAdc ?? 0, packet.mq4?.rawAdc ?? 0);
    const level = packet.gasLevel ?? (packet.status === 'DANGER' ? 2 : packet.status === 'WARNING' ? 1 : null);
    const helmetGas = level === 2 ? 'critical' : level === 1 ? 'warning' : null;
    const helmetDecides = level !== null || Boolean(packet.status);
    if (helmetGas || (packet.mq2?.rawAdc !== null && packet.mq2?.rawAdc !== undefined)) {
      if (helmetGas === 'critical' || (!helmetDecides && adc >= thresholds.gasCritical)) {
        newAlerts.push({
          id: `gas_crit_${Date.now()}`,
          type: 'GAS_CRITICAL',
          title: 'DANGEROUS GAS / SMOKE LEAK',
          message: `Gas sensors above danger level (MQ-2 ${packet.mq2?.rawAdc ?? '-'}, MQ-4 ${packet.mq4?.rawAdc ?? '-'} ADC).`,
          timestamp,
          severity: 'critical',
          acknowledged: false,
          sensor: 'MQ-2 / MQ-4',
          sound: 'critical',
        });
      } else if (helmetGas === 'warning' || (!helmetDecides && adc >= thresholds.gasWarning)) {
        newAlerts.push({
          id: `gas_warn_${Date.now()}`,
          type: 'GAS_WARNING',
          title: 'ELEVATED GAS READING',
          message: `Gas sensors above caution level (MQ-2 ${packet.mq2?.rawAdc ?? '-'}, MQ-4 ${packet.mq4?.rawAdc ?? '-'} ADC).`,
          timestamp,
          severity: 'warning',
          acknowledged: false,
          sensor: 'MQ-2 / MQ-4',
          sound: 'warning',
        });
      }
    }

    // 3. Motion / Shock Check
    const { accel, roll, pitch } = packet.mpu6050;
    if (accel && accel.x !== null) {
      const gForce = calculateGForce(accel.x, accel.y, accel.z);
      if (gForce >= thresholds.fallGForce) {
        newAlerts.push({
          id: `shock_${Date.now()}`,
          type: 'HIGH_G_SHOCK',
          title: 'IMPACT DETECTED',
          message: `MPU-6050 registered ${gForce.toFixed(2)}g. The helmet checks for stillness before confirming a fall.`,
          timestamp,
          severity: 'warning',
          acknowledged: false,
          sensor: 'MPU-6050',
          sound: 'warning',
        });
      } else if (Math.abs(roll) > thresholds.tiltLimit || Math.abs(pitch) > thresholds.tiltLimit) {
        newAlerts.push({
          id: `tilt_${Date.now()}`,
          type: 'TILT_WARNING',
          title: 'ABNORMAL POSTURE TILT',
          message: `Worker attitude angle exceeded limit: Roll ${roll}°, Pitch ${pitch}°.`,
          timestamp,
          severity: 'warning',
          acknowledged: false,
          sensor: 'MPU-6050',
          sound: 'warning',
        });
      }
    }

    // Only raise each alert type once per 30 s while the condition continues, and only then play a sound
    const nowMs = Date.now();
    const fresh = newAlerts.filter((na) => {
      const last = lastAlertAtRef.current[na.type] || 0;
      if (nowMs - last < ALERT_REPEAT_MS) return false;
      lastAlertAtRef.current[na.type] = nowMs;
      return true;
    });
    if (fresh.length > 0) {
      if (fresh.some((a) => a.sound === 'sos')) soundEffects.playSosAlarm();
      else if (fresh.some((a) => a.sound === 'critical')) soundEffects.playCriticalAlarm();
      else soundEffects.playWarningBeep();
      setAlerts((prev) => [...fresh, ...prev].slice(0, 50));
    }
  }, [thresholds]);

  // Unified incoming packet consumer for both Local Backend SSE & Firebase
  const handleIncomingPacket = useCallback((rawVal) => {
    if (!rawVal || typeof rawVal !== 'object' || Object.keys(rawVal).length === 0) return;
    const hwPacket = parseHardwarePacket(rawVal);
    setFirebaseConnected(true);
    setLiveEmpty(false);
    setLiveError(null);
    setFirebaseError(null);
    setLiveLoading(false);
    setLiveLastPacketTime(Date.now());

    if (!streamPaused) {
      setLatestPacket(hwPacket);
      setHistoryBuffer((prev) => [...prev.slice(-29), hwPacket]);
      evaluateAlerts(hwPacket);
    }
  }, [streamPaused, evaluateAlerts]);

  // 1. Local Backend Ingestion Stream Listener (SSE + Immediate Fetch + Resilient Polling)
  useEffect(() => {
    let eventSource = null;
    let retryTimer = null;

    // A. Immediate Snapshot Fetch & Continuous 1-second sync
    const fetchLatest = async () => {
      try {
        const res = await fetch('http://localhost:5000/api/latest');
        if (res.ok) {
          const data = await res.json();
          if (data && data.device && data.mq2 && data.status !== 'waiting_for_data') {
            handleIncomingPacket(data);
          }
        }
      } catch {}
    };

    fetchLatest();
    const pollInterval = setInterval(fetchLatest, 1000);

    // B. Real-time Server-Sent Events (SSE) Stream
    const connectSSE = () => {
      try {
        eventSource = new EventSource('http://localhost:5000/api/stream');

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleIncomingPacket(data);
          } catch (e) {
            console.error('[SSE JSON Parse Error]', e);
          }
        };

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          retryTimer = setTimeout(connectSSE, 4000);
        };
      } catch (err) {
        retryTimer = setTimeout(connectSSE, 4000);
      }
    };

    connectSSE();

    return () => {
      clearInterval(pollInterval);
      if (eventSource) eventSource.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [handleIncomingPacket]);

  // 2. Realtime Database Listener for Production Telemetry
  useEffect(() => {
    const config = getStoredFirebaseConfig();
    const fb = initFirebase(config);

    if (!fb.success || !fb.db) {
      // If Firebase isn't configured, local SSE stream handles telemetry
      return;
    }

    if (!authReady || !firebaseUser) {
      return;
    }

    // Authenticated session verified. Subscribe to the real hardware endpoints.
    const telemetryRef = ref(fb.db, 'devices/ANVESHAK-ESP32-01/latest');

    const unsubscribeTelemetry = onValue(
      telemetryRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val && typeof val === 'object' && Object.keys(val).length > 0) {
          handleIncomingPacket(val);
        }
      },
      (err) => {
        console.warn('Firebase RTDB listener note:', err.message);
      }
    );

    // Secondary Alerts Endpoint: /devices/ANVESHAK-ESP32-01/alerts
    const alertsRef = ref(fb.db, 'devices/ANVESHAK-ESP32-01/alerts');
    const unsubscribeAlerts = onValue(
      alertsRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val && typeof val === 'object') {
          const list = Object.keys(val).map(key => ({
            id: key,
            ...val[key],
          })).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          setAlerts(list);
        }
      },
      () => {}
    );

    return () => {
      if (typeof unsubscribeTelemetry === 'function') unsubscribeTelemetry();
      if (typeof unsubscribeAlerts === 'function') unsubscribeAlerts();
      off(telemetryRef);
      off(alertsRef);
    };
  }, [handleIncomingPacket, authReady, firebaseUser]);

  const acknowledgeAlert = (id) => {
    setAlerts(prev =>
      prev.map(a => (a.id === id ? { ...a, acknowledged: true } : a))
    );
    acknowledgeAlertInFirebase(id).catch(err => {
      console.warn('Failed to sync alert acknowledgement to Firebase:', err);
    });
  };

  const acknowledgeAllAlerts = () => {
    setAlerts(prev => {
      prev.forEach(a => {
        if (!a.acknowledged) {
          acknowledgeAlertInFirebase(a.id).catch(() => {});
        }
      });
      return prev.map(a => ({ ...a, acknowledged: true }));
    });
  };

  const clearAlertHistory = () => {
    setAlerts([]);
  };

  return (
    <TelemetryContext.Provider
      value={{
        mode,
        setMode,
        latestPacket,
        historyBuffer,
        alerts,
        thresholds,
        setThresholds,
        streamPaused,
        setStreamPaused,
        soundEnabled,
        setSoundEnabled,
        firebaseConnected,
        firebaseError,
        liveLastPacketTime,
        liveLoading,
        liveError,
        liveEmpty,
        deviceStatus,
        now,
        acknowledgeAlert,
        acknowledgeAllAlerts,
        clearAlertHistory,
      }}
    >
      {children}
    </TelemetryContext.Provider>
  );
};

export const useTelemetry = () => useContext(TelemetryContext);
