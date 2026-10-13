import React, { useState } from 'react';
import {
  Wind,
  Activity,
  Thermometer,
  AlertTriangle,
  CheckCircle,
  Clock,
  Radio,
  Database,
  ChevronDown,
  ChevronUp,
  Cpu,
  Send,
  AlertOctagon,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { useAuth } from '../context/AuthContext';
import { Badge } from '../components/common/Badge';
import { OrientationCube } from '../components/visualizers/OrientationCube';
import { OledDisplaySim } from '../components/visualizers/OledDisplaySim';
import { Esp32BoardPinout } from '../components/visualizers/Esp32BoardPinout';
import {
  formatADC,
  formatPPM,
  formatVoltage,
  formatAccel,
  formatGyro,
  formatTimestamp,
  calculateGForce,
  getGasStatus,
  getMotionStatus,
  getOverallSystemStatus,
} from '../utils/formatters';
import { writeTestTelemetryPacket } from '../services/firebase';

export const LiveSensors = () => {
  const {
    latestPacket,
    historyBuffer,
    thresholds,
    alerts,
    liveLoading,
    liveError,
    liveEmpty,
    deviceStatus,
    acknowledgeAlert,
  } = useTelemetry();

  const { user, loginWithGoogle } = useAuth();

  // Diagnostics collapsible section
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [testWriteStatus, setTestWriteStatus] = useState(null);

  // 1. Truthful Device Connection Evaluation
  const isConnected = deviceStatus?.status === 'Device Online';

  // 2. Sensor extraction & status computation
  const mq2 = latestPacket?.mq2;
  const mpu = latestPacket?.mpu6050;

  const gasStatus = getGasStatus(
    mq2?.rawAdc,
    { warning: thresholds.gasWarning, critical: thresholds.gasCritical }
  );

  const gForce = calculateGForce(
    mpu?.accel?.x || 0,
    mpu?.accel?.y || 0,
    mpu?.accel?.z || 1
  );

  const motionStatus = getMotionStatus(
    gForce,
    mpu?.roll || 0,
    mpu?.pitch || 0
  );

  const overallStatus = getOverallSystemStatus({
    deviceStatus,
    gasStatus,
    motionStatus,
    sosActive: Boolean(latestPacket?.sosActive),
  });

  // Temperature validation: never invent temperature readings
  const hasValidTemp =
    typeof mpu?.tempC === 'number' && !isNaN(mpu.tempC) && mpu.tempC > -40 && mpu.tempC < 125;

  // Chart data from rolling history buffer
  const chartData = historyBuffer.map((item) => ({
    time: formatTimestamp(item.timestamp),
    gasAdc: item.mq2?.rawAdc ?? 0,
    accelX: item.mpu6050?.accel?.x ?? 0,
    accelY: item.mpu6050?.accel?.y ?? 0,
    accelZ: item.mpu6050?.accel?.z ?? 1,
  }));

  // Handle manual test packet writing
  const handleSendTestPacket = async () => {
    setTestWriteStatus('Sending telemetry test packet...');
    try {
      const res = await fetch('http://localhost:5000/api/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Key': 'anveshak_sec_key_esp32_01',
        },
        body: JSON.stringify({
          device: 'ANVESHAK-ESP32-01',
          mq2: { rawAdc: 680, voltage: 0.55 },
          mpu6050: {
            accel: { x: 0.04, y: -0.03, z: 0.98 },
            gyro: { x: 0.6, y: -0.2, z: 0.1 },
            tempC: 30.5,
            roll: 2,
            pitch: -1,
          },
          esp32: {
            isOnline: true,
            rssi: -55,
            ipAddress: '10.9.2.238',
            uptimeSeconds: 150,
          },
          lora: { status: true },
          sosActive: false,
        }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      setTestWriteStatus('Success: Test telemetry frame ingested & live stream updated!');
      setTimeout(() => setTestWriteStatus(null), 4000);
    } catch {
      // Fallback to Firebase client SDK if local backend unreachable
      try {
        await writeTestTelemetryPacket();
        setTestWriteStatus('Success: Test telemetry frame published to Firebase!');
        setTimeout(() => setTestWriteStatus(null), 4000);
      } catch (fbErr) {
        setTestWriteStatus(`Error: ${fbErr.message}`);
        setTimeout(() => setTestWriteStatus(null), 5000);
      }
    }
  };

  // Recent safety alerts (limit to last 4)
  const recentAlerts = alerts.slice(0, 4);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">

      {/* =================================================================== */}
      {/* 1. MAIN STATUS SECTION                                              */}
      {/* =================================================================== */}
      <section className="p-4 lg:p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3.5 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight">
                Live Safety Monitoring
              </h1>
              <Badge variant={overallStatus.level} size="sm">
                {overallStatus.status.toUpperCase()}
              </Badge>
              {latestPacket?.isSimulated || latestPacket?.source === 'test-packet' ? (
                <Badge variant="warning" size="xs">
                  TEST PACKET (SIMULATED)
                </Badge>
              ) : isConnected ? (
                <Badge variant="clean" size="xs">
                  REAL HARDWARE FEED
                </Badge>
              ) : deviceStatus?.status === 'Device Offline' ? (
                <Badge variant="warning" size="xs">
                  DEVICE OFFLINE
                </Badge>
              ) : (
                <Badge variant="outline" size="xs">
                  WAITING FOR HARDWARE
                </Badge>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-1 font-sans">
              {overallStatus.label}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 text-xs font-mono">
            {/* Device Connectivity Badge */}
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                deviceStatus?.level === 'critical'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : deviceStatus?.level === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-800'
                  : deviceStatus?.level === 'info'
                  ? 'bg-sky-50 border-sky-200 text-sky-700'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-700'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Main Device: {deviceStatus?.displayLabel}</span>
            </div>

            {/* Last Data Received */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
              <Clock className="w-3.5 h-3.5 text-cyan-600" />
              <span className="text-slate-500">Last Data Received:</span>
              <span className="text-slate-900 font-bold">
                {latestPacket?.timestamp ? formatTimestamp(latestPacket.timestamp) : '--:--:--'}
              </span>
            </div>
          </div>
        </div>

        {/* Waiting for Data Pending Banner (When in Live Mode with No Broadcast Yet) */}
        {liveEmpty && !liveLoading && (
          <div className="p-4 rounded-xl bg-sky-50/70 border border-sky-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <Database className="w-5 h-5 text-sky-600 shrink-0" />
              <div>
                <div className="font-bold text-slate-900 text-sm">
                  Waiting for hardware data — no readings received yet.
                </div>
                <div className="text-slate-600 font-sans mt-0.5">
                  Connected to Realtime Database endpoint <code className="text-sky-700 bg-sky-100/70 px-1 py-0.5 rounded font-mono">/devices/ANVESHAK-ESP32-01/latest</code>. Awaiting live sensor broadcast from physical ESP32 hardware.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSendTestPacket}
                className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold transition-colors shadow-sm text-xs"
                title="Write a simulated verification frame to test Firebase connectivity"
              >
                [Test Only] Write Verification Packet
              </button>
            </div>
          </div>
        )}

        {/* Live Hardware Mode: Database Error / Notice */}
        {liveError && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="text-red-800 font-medium">{liveError}</span>
            </div>
            {!user?.isGoogleUser && !user?.isFirebaseUser && (
              <button
                onClick={loginWithGoogle}
                className="px-3 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors shrink-0 font-sans shadow-sm"
              >
                Sign in with Google
              </button>
            )}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 2. SENSOR CARDS GRID                                                */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* CARD 1: Gas & Smoke Sensor */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200 shadow-sm">
                  <Wind className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Gas & Smoke Sensor</h2>
                  <div className="text-[11px] text-slate-500 font-mono">MQ-2 Analog Detector</div>
                </div>
              </div>

              <Badge variant={gasStatus.level} size="sm">
                {gasStatus.label}
              </Badge>
            </div>

            {/* Current Reading Hero */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex justify-between items-baseline">
                <span className="text-2xl font-black text-slate-900 font-mono">
                  {mq2?.rawAdc !== null && mq2?.rawAdc !== undefined ? formatADC(mq2?.rawAdc) : '--'}
                </span>
                <span className="text-xs font-mono text-cyan-700 font-semibold">
                  {mq2?.ppm !== null && mq2?.ppm !== undefined ? `~${formatPPM(mq2?.ppm)} (calibrated)` : 'Uncalibrated (Raw ADC)'}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex justify-between font-mono">
                <span>Signal: {mq2?.voltage !== null && mq2?.voltage !== undefined ? `${Number(mq2.voltage).toFixed(2)} V` : formatVoltage(mq2?.rawAdc)}</span>
                <span>Scale: 0 – 4095 ADC (Raw)</span>
              </div>
            </div>

            {/* Segmented Progress Gauge */}
            <div className="space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Safety Level</span>
                <span className={gasStatus.level === 'critical' ? 'text-red-600 font-bold' : gasStatus.level === 'warning' ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                  {gasStatus.status}
                </span>
              </div>

              {/* Multi-tier colored gauge bar */}
              <div className="h-3 w-full rounded-full bg-slate-100 border border-slate-200 overflow-hidden relative">
                {/* Safe zone: 0 - 800 (~20%) */}
                <div className="absolute left-0 top-0 bottom-0 w-[20%] bg-emerald-100/70 border-r border-slate-200" />
                {/* Warning zone: 800 - 1000 (~5%) */}
                <div className="absolute left-[20%] top-0 bottom-0 w-[5%] bg-amber-100/70 border-r border-slate-200" />
                {/* Critical zone: 1000 - 4095 (~75%) */}
                <div className="absolute left-[25%] top-0 bottom-0 w-[75%] bg-red-100/70" />

                {/* Live reading indicator */}
                {mq2?.rawAdc !== undefined && mq2?.rawAdc !== null && (
                  <div
                    className={`h-full transition-all duration-300 ${
                      gasStatus.level === 'critical'
                        ? 'bg-red-500'
                        : gasStatus.level === 'warning'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                    style={{
                      width: `${Math.min(100, Math.max(4, (mq2.rawAdc / 4095) * 100))}%`,
                    }}
                  />
                )}
              </div>

              {/* Threshold limits note */}
              <div className="flex justify-between text-[10px] text-slate-500 pt-0.5">
                <span>Caution: ≥ {thresholds.gasWarning} ADC</span>
                <span className="text-red-700 font-bold">Critical Buzzer Alarm: ≥ {thresholds.gasCritical} ADC</span>
              </div>
            </div>
          </div>

          {/* Mini 30s Gas Waveform */}
          <div className="h-28 w-full pt-1 border-t border-slate-200">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.8} />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={9} tickLine={false} hide />
                  <YAxis domain={[400, 4095]} stroke="#64748B" fontSize={9} tickLine={false} hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', fontSize: '11px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="gasAdc"
                    stroke="#06B6D4"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    name="Gas ADC"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-slate-500 font-mono">
                Awaiting hardware telemetry stream...
              </div>
            )}
          </div>
        </div>

        {/* CARD 2: Motion Sensor */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200 shadow-sm">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Motion Sensor</h2>
                  <div className="text-[11px] text-slate-500 font-mono">MPU-6050 6-Axis IMU</div>
                </div>
              </div>

              <Badge variant={motionStatus.level} size="sm">
                {motionStatus.label}
              </Badge>
            </div>

            {/* Acceleration Readouts */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex justify-between items-center text-xs font-mono">
                <span className="text-slate-500">Total Acceleration:</span>
                <span className="text-base font-bold text-slate-900">
                  {mpu?.accel?.x !== undefined && mpu?.accel?.x !== null ? `${gForce.toFixed(2)} g` : '-- g'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 font-mono text-center text-xs pt-1 border-t border-slate-200">
                <div className="p-1.5 rounded bg-white border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 block">ACCEL X</span>
                  <span className="font-bold text-slate-800">
                    {mpu?.accel?.x !== undefined && mpu?.accel?.x !== null ? formatAccel(mpu.accel.x) : '--'}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-white border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 block">ACCEL Y</span>
                  <span className="font-bold text-slate-800">
                    {mpu?.accel?.y !== undefined && mpu?.accel?.y !== null ? formatAccel(mpu.accel.y) : '--'}
                  </span>
                </div>
                <div className="p-1.5 rounded bg-white border border-slate-200 shadow-sm">
                  <span className="text-[10px] text-slate-500 block">ACCEL Z</span>
                  <span className="font-bold text-slate-800">
                    {mpu?.accel?.z !== undefined && mpu?.accel?.z !== null ? formatAccel(mpu.accel.z) : '--'}
                  </span>
                </div>
              </div>
            </div>

            {/* Gyroscope & Attitude Readouts */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 font-mono text-xs">
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Gyroscope:</span>
                <span className="text-slate-800">
                  {mpu?.gyro?.x !== undefined && mpu?.gyro?.x !== null
                    ? `X:${formatGyro(mpu.gyro.x)} Y:${formatGyro(mpu.gyro.y)} Z:${formatGyro(mpu.gyro.z)}`
                    : '--'}
                </span>
              </div>
              <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200">
                <span>Spatial Attitude:</span>
                <span className="text-cyan-700 font-semibold">
                  {mpu?.roll !== undefined && mpu?.roll !== null
                    ? `Roll: ${mpu.roll ?? 0}°  Pitch: ${mpu.pitch ?? 0}°`
                    : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Mini 30s Accel Waveform */}
          <div className="h-28 w-full pt-1 border-t border-slate-200">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" opacity={0.8} />
                  <XAxis dataKey="time" stroke="#64748B" fontSize={9} tickLine={false} hide />
                  <YAxis domain={[-2, 2]} stroke="#64748B" fontSize={9} tickLine={false} hide />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#CBD5E1', borderRadius: '8px', fontSize: '11px', color: '#0F172A', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  />
                  <Line type="monotone" dataKey="accelX" stroke="#EF4444" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Accel X (g)" />
                  <Line type="monotone" dataKey="accelY" stroke="#10B981" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Accel Y (g)" />
                  <Line type="monotone" dataKey="accelZ" stroke="#0284C7" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Accel Z (g)" />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-[11px] text-slate-500 font-mono">
                Awaiting hardware motion stream...
              </div>
            )}
          </div>
        </div>

        {/* CARD 3: Temperature & Thermal Monitoring (Valid Sensor Data Only) */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200 shadow-sm">
                  <Thermometer className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Temperature</h2>
                  <div className="text-[11px] text-slate-500 font-mono">Onboard Sensor Telemetry</div>
                </div>
              </div>

              {hasValidTemp ? (
                <Badge variant={mpu.tempC >= 45 ? 'warning' : 'clean'} size="sm">
                  {mpu.tempC >= 45 ? 'OVERHEATING' : 'NORMAL'}
                </Badge>
              ) : (
                <Badge variant="outline" size="sm">
                  NO READING
                </Badge>
              )}
            </div>

            {/* Valid Reading Presentation */}
            {hasValidTemp ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between items-baseline font-mono">
                  <span className="text-3xl font-black text-slate-900">
                    {mpu.tempC.toFixed(1)} °C
                  </span>
                  <span className="text-sm text-slate-500 font-semibold">
                    {((mpu.tempC * 9) / 5 + 32).toFixed(1)} °F
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 font-sans mt-1">
                  Measured via MPU-6050 integrated internal thermal diode.
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-1">
                <span className="text-slate-700 text-xs font-mono font-medium block">
                  No Active Temperature Reading
                </span>
                <span className="text-[11px] text-slate-500 block">
                  Awaiting live sensor reading from hardware.
                </span>
              </div>
            )}

            {/* Thermal Operational Info */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 font-mono text-xs space-y-1">
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Safe Threshold:</span>
                <span className="text-emerald-700 font-semibold">&lt; 45.0 °C</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-500">
                <span>Warning Limit:</span>
                <span className="text-amber-700 font-semibold">&ge; 45.0 °C</span>
              </div>
            </div>
          </div>

          {/* Emergency SOS Status Sub-box */}
          <div
            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
              latestPacket?.sosActive
                ? 'bg-red-50 border-red-300 text-red-900 animate-pulse'
                : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertOctagon className={`w-4 h-4 ${latestPacket?.sosActive ? 'text-red-600' : 'text-slate-500'}`} />
              <div>
                <div className="text-xs font-bold text-slate-900">
                  {latestPacket?.sosActive ? 'EMERGENCY SOS ACTIVE' : 'SOS Pushbutton Ready'}
                </div>
                <div className="text-[10px] text-slate-500">
                  {latestPacket?.sosActive ? 'Immediate assistance dispatched!' : 'Monitored on GPIO 04 interrupt'}
                </div>
              </div>
            </div>

            <Badge variant={latestPacket?.sosActive ? 'critical' : 'clean'} size="xs">
              {latestPacket?.sosActive ? 'ALARM' : 'STANDBY'}
            </Badge>
          </div>
        </div>

      </div>

      {/* =================================================================== */}
      {/* 3. RECENT SAFETY ALERTS SECTION                                     */}
      {/* =================================================================== */}
      <section className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-3">
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900">Recent Safety Alerts</h2>
          </div>

          {recentAlerts.length > 0 && (
            <span className="text-xs font-mono text-slate-500">
              Showing {recentAlerts.length} events
            </span>
          )}
        </div>

        {recentAlerts.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-3 text-xs text-slate-700">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>All parameters within safe operating thresholds. No active safety alerts recorded.</span>
          </div>
        ) : (
          <div className="space-y-2">
            {recentAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-3 rounded-xl border flex flex-wrap items-center justify-between gap-3 text-xs ${
                  alert.severity === 'critical'
                    ? 'bg-red-50/70 border-red-200 text-slate-900'
                    : 'bg-amber-50/70 border-amber-200 text-slate-900'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                      alert.severity === 'critical' ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                  />
                  <div>
                    <div className="font-bold text-slate-900 flex items-center gap-2">
                      <span>{alert.title}</span>
                      <span className="text-[10px] font-mono text-slate-500">
                        {formatTimestamp(alert.timestamp)}
                      </span>
                    </div>
                    <div className="text-slate-600 text-[11px] mt-0.5">{alert.message}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={alert.severity} size="xs">
                    {alert.severity.toUpperCase()}
                  </Badge>
                  {!alert.acknowledged ? (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-2.5 py-1 text-[11px] font-semibold rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span className="text-[10px] font-mono text-emerald-700 font-semibold">Acknowledged</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 4. OPTIONAL DEVICE DIAGNOSTICS (COLLAPSIBLE)                        */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setShowDiagnostics((p) => !p)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-cyan-600" />
            <div>
              <span className="text-sm font-bold text-slate-900">Device Diagnostics & Peripheral Matrix</span>
              <span className="text-xs text-slate-500 block font-normal">
                ESP32 pin connections, virtual display screen, and board registers
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-cyan-700 font-mono font-medium">
            <span>{showDiagnostics ? 'Hide Diagnostics' : 'Show Diagnostics'}</span>
            {showDiagnostics ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showDiagnostics && (
          <div className="p-5 border-t border-slate-200 space-y-5 bg-slate-50/50">
            {/* Visualizer Row: Virtual Screen & Orientation Cube */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <OledDisplaySim packet={latestPacket} />
              <OrientationCube
                roll={mpu?.roll}
                pitch={mpu?.pitch}
                accel={mpu?.accel}
                gyro={mpu?.gyro}
              />
            </div>

            {/* Hardware Pinout & Bus Matrix */}
            <Esp32BoardPinout esp32={latestPacket?.esp32} isSimulated={false} />

            {/* Manual Test Frame Dispatcher */}
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="font-bold text-slate-900 flex items-center gap-2">
                  <span>Firebase Connection Test Tool</span>
                  <Badge variant="outline" size="xs">TEST ONLY</Badge>
                </div>
                <div className="text-slate-500 text-[11px] mt-0.5">
                  Writes a synthetic test frame marked as <code className="text-amber-700 bg-amber-50 px-1 py-0.5 rounded font-mono">isSimulated: true</code> to verify Firebase listeners. Never treated as real hardware.
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendTestPacket}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 font-semibold shadow-sm font-mono transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>[Test Only] Write Verification Packet</span>
                </button>
              </div>
            </div>

            {testWriteStatus && (
              <div className="p-2.5 rounded-lg bg-white border border-slate-200 text-xs font-mono text-cyan-800 shadow-sm">
                {testWriteStatus}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
};
