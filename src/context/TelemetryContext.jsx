import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
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
    mq2: {
      rawAdc: rawAdc !== null ? Number(rawAdc) : null,
      voltage: voltage !== null ? Number(voltage) : null,
      ppm: val.mq2?.ppm !== undefined && val.mq2?.ppm !== null ? Number(val.mq2.ppm) : null,
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
      status: val.lora?.status ?? val.loraOK ?? true,
    },
    sosActive: Boolean(val.sosActive ?? val.alarmActive ?? val.sos),
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
      });
      soundEffects.playSosAlarm();
    }

    // 2. Gas threshold check
    const adc = packet.mq2?.rawAdc;
    if (adc !== null && adc !== undefined) {
      if (adc >= thresholds.gasCritical) {
        newAlerts.push({
          id: `gas_crit_${Date.now()}`,
          type: 'GAS_CRITICAL',
          title: 'DANGEROUS GAS / SMOKE LEAK',
          message: `MQ-2 sensor exceeded critical threshold: ${adc} ADC.`,
          timestamp,
          severity: 'critical',
          acknowledged: false,
          sensor: 'MQ-2',
        });
        soundEffects.playCriticalAlarm();
      } else if (adc >= thresholds.gasWarning) {
        newAlerts.push({
          id: `gas_warn_${Date.now()}`,
          type: 'GAS_WARNING',
          title: 'ELEVATED GAS READING',
          message: `MQ-2 sensor above caution threshold: ${adc} ADC.`,
          timestamp,
          severity: 'warning',
          acknowledged: false,
          sensor: 'MQ-2',
        });
        soundEffects.playWarningBeep();
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
          title: 'HIGH G-FORCE IMPACT SHOCK',
          message: `MPU-6050 registered shock acceleration of ${gForce.toFixed(2)}g.`,
          timestamp,
          severity: 'critical',
          acknowledged: false,
          sensor: 'MPU-6050',
        });
        soundEffects.playCriticalAlarm();
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
        });
        soundEffects.playWarningBeep();
      }
    }

    // Append without spamming identical alerts within 4 seconds
    if (newAlerts.length > 0) {
      setAlerts(prev => {
        const filteredNew = newAlerts.filter(na => {
          return !prev.some(p => p.type === na.type && !p.acknowledged && (Date.now() - new Date(p.timestamp).getTime() < 4000));
        });
        return [...filteredNew, ...prev].slice(0, 50);
      });
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
