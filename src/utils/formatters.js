/**
 * ANVESHAK Telemetry Formatters and Helper Functions
 */

export const formatADC = (value) => {
  if (value === null || value === undefined) return '--';
  return Math.round(value).toLocaleString();
};

export const formatVoltage = (adcValue, vRef = 3.3, maxADC = 4095) => {
  if (adcValue === null || adcValue === undefined) return '-- V';
  const volts = (adcValue / maxADC) * vRef;
  return `${volts.toFixed(2)} V`;
};

export const formatPPM = (ppm) => {
  if (ppm === null || ppm === undefined) return '-- ppm';
  return `${Math.round(ppm)} ppm`;
};

export const formatAccel = (val) => {
  if (val === null || val === undefined) return '-- g';
  return `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(2)} g`;
};

export const formatGyro = (val) => {
  if (val === null || val === undefined) return '-- °/s';
  return `${Number(val) >= 0 ? '+' : ''}${Number(val).toFixed(1)} °/s`;
};

export const formatTemp = (tempC, unit = 'C') => {
  if (tempC === null || tempC === undefined) return '-- °';
  if (unit === 'F') {
    const f = (tempC * 9) / 5 + 32;
    return `${f.toFixed(1)} °F`;
  }
  return `${Number(tempC).toFixed(1)} °C`;
};

export const formatTimestamp = (dateOrStr) => {
  if (!dateOrStr) return '--:--:--';
  const d = new Date(dateOrStr);
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

export const formatDateTime = (dateOrStr) => {
  if (!dateOrStr) return '--';
  const d = new Date(dateOrStr);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

export const calculateGForce = (ax, ay, az) => {
  return Math.sqrt(ax * ax + ay * ay + az * az);
};

export const calculateOrientation = (ax, ay, az) => {
  // Approximate roll and pitch from accelerometer
  const pitch = Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI);
  const roll = Math.atan2(-ax, az) * (180 / Math.PI);
  return {
    pitch: Math.round(pitch),
    roll: Math.round(roll),
  };
};

/**
 * Determine truthful connection status of the Main Monitoring Device
 * Required states: Waiting for Data, Device Online, Device Offline, Connection Error
 */
export const getDeviceConnectionStatus = ({
  latestPacket,
  liveLastPacketTime,
  liveEmpty,
  liveLoading,
  liveError,
  now = Date.now(),
  timeoutMs = 15000,
}) => {
  // 1. Connection Error: permission denied, invalid config, or RTDB connection error
  if (liveError) {
    return {
      status: 'Connection Error',
      displayLabel: liveError.includes('Permission Denied') ? 'Permission Denied' : 'Connection Error',
      level: 'critical',
      color: 'red',
      isLive: true,
      errorDetail: liveError,
    };
  }

  // 2. Waiting for Data: connecting, initial loading, or empty database path
  if (liveLoading) {
    return {
      status: 'Waiting for Data',
      displayLabel: 'Connecting to Firebase...',
      level: 'info',
      color: 'cyan',
      isLive: true,
    };
  }

  if (liveEmpty || !latestPacket || !liveLastPacketTime) {
    return {
      status: 'Waiting for Data',
      displayLabel: 'Waiting for Data',
      level: 'info',
      color: 'cyan',
      isLive: true,
    };
  }

  // Determine actual heartbeat age from hardware timestamp / heartbeat field
  let packetTime = null;
  if (latestPacket.heartbeat) {
    const t = new Date(latestPacket.heartbeat).getTime();
    if (!isNaN(t)) packetTime = t;
  }
  if (!packetTime && latestPacket.timestamp) {
    const t = new Date(latestPacket.timestamp).getTime();
    if (!isNaN(t)) packetTime = t;
  }
  if (!packetTime) {
    packetTime = liveLastPacketTime;
  }

  // Elapsed time since last genuine device heartbeat
  const currentTime = typeof now === 'number' ? now : Date.now();
  const heartbeatAgeMs = Math.max(0, currentTime - packetTime);
  const isHeartbeatFresh = heartbeatAgeMs <= timeoutMs;
  const reportedOnline = latestPacket?.esp32?.isOnline !== false;

  // 3. Device Offline: heartbeat expired or hardware reported offline
  if (!isHeartbeatFresh || !reportedOnline) {
    return {
      status: 'Device Offline',
      displayLabel: 'Device Offline',
      level: 'warning',
      color: 'amber',
      isLive: true,
      lastSeenMs: heartbeatAgeMs,
      isFresh: false,
    };
  }

  // 4. Device Online: active recent heartbeat from physical hardware
  return {
    status: 'Device Online',
    displayLabel: 'Device Online',
    level: 'normal',
    color: 'emerald',
    isLive: true,
    lastSeenMs: heartbeatAgeMs,
    isFresh: true,
  };
};

/**
 * Gas & Smoke Sensor safety classification
 */
export const getGasStatus = (adc, thresholds = { warning: 800, critical: 1000 }) => {
  if (adc === null || adc === undefined) {
    return { label: 'No Reading Available', level: 'offline', color: 'slate', status: 'Waiting for Data' };
  }
  if (adc >= thresholds.critical) {
    return { label: 'CRITICAL SMOKE ALARM (≥1000)', level: 'critical', color: 'red', status: 'Critical' };
  }
  if (adc >= thresholds.warning) {
    return { label: 'Elevated Gas Reading', level: 'warning', color: 'amber', status: 'Warning' };
  }
  return { label: 'Normal Air Quality', level: 'normal', color: 'emerald', status: 'Normal' };
};

/**
 * Motion Sensor acceleration & attitude classification
 */
export const getMotionStatus = (gForce, roll = 0, pitch = 0) => {
  if (gForce === null || gForce === undefined) {
    return { label: 'No Reading Available', level: 'offline', color: 'slate', detail: 'Waiting for hardware' };
  }
  if (gForce >= 2.5) {
    return { label: 'High G-Force Impact Shock', level: 'critical', color: 'red', detail: `${gForce.toFixed(2)}g Shock Detected` };
  }
  if (Math.abs(roll) > 45 || Math.abs(pitch) > 45) {
    return { label: 'High Tilt Angle', level: 'warning', color: 'amber', detail: `Roll:${roll}° Pitch:${pitch}°` };
  }
  if (gForce > 1.8) {
    return { label: 'Sudden Movement', level: 'warning', color: 'amber', detail: `${gForce.toFixed(2)}g Movement` };
  }
  return { label: 'Stable Orientation', level: 'normal', color: 'emerald', detail: 'Normal Acceleration' };
};

/**
 * Overall System Safety Status
 */
export const getOverallSystemStatus = ({
  deviceStatus,
  gasStatus,
  motionStatus,
  sosActive,
}) => {
  if (sosActive) {
    return {
      status: 'Critical',
      label: 'Critical: Emergency SOS Triggered',
      level: 'critical',
      color: 'red',
    };
  }
  if (gasStatus?.level === 'critical') {
    return {
      status: 'Critical',
      label: 'Critical: Gas & Smoke Threshold Exceeded',
      level: 'critical',
      color: 'red',
    };
  }
  if (motionStatus?.level === 'critical') {
    return {
      status: 'Critical',
      label: 'Critical: High G-Force Impact Shock',
      level: 'critical',
      color: 'red',
    };
  }
  if (deviceStatus?.status === 'Connection Error') {
    return {
      status: 'Connection Error',
      label: 'Connection Error: Telemetry Stream Unavailable',
      level: 'critical',
      color: 'red',
    };
  }
  if (deviceStatus?.status === 'Device Offline' || deviceStatus?.status === 'Disconnected') {
    return {
      status: 'Device Offline',
      label: 'Warning: Main Monitoring Device Offline',
      level: 'warning',
      color: 'amber',
    };
  }
  if (gasStatus?.level === 'warning') {
    return {
      status: 'Warning',
      label: 'Warning: Elevated Gas Reading',
      level: 'warning',
      color: 'amber',
    };
  }
  if (motionStatus?.level === 'warning') {
    return {
      status: 'Warning',
      label: 'Warning: Abnormal Motion / Tilt Angle',
      level: 'warning',
      color: 'amber',
    };
  }
  if (deviceStatus?.status === 'Waiting for Data') {
    return {
      status: 'Waiting for Data',
      label: 'Waiting for Data from Device',
      level: 'info',
      color: 'cyan',
    };
  }
  return {
    status: 'Normal',
    label: 'All Systems Normal',
    level: 'normal',
    color: 'emerald',
  };
};
