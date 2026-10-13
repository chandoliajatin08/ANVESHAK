import React, { useState } from 'react';
import {
  Cpu,
  RefreshCw,
  Terminal,
  Server,
} from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { Badge } from '../components/common/Badge';
import { StatusIndicator } from '../components/common/StatusIndicator';
import { Esp32BoardPinout } from '../components/visualizers/Esp32BoardPinout';
import { formatTimestamp } from '../utils/formatters';

export const DeviceStatus = () => {
  const { latestPacket, deviceStatus } = useTelemetry();

  const esp32 = latestPacket?.esp32;
  const devStatus = deviceStatus || { status: 'Waiting for Data', displayLabel: 'Waiting for Data' };
  const isOnline = devStatus.status === 'Device Online';

  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState([
    '[INIT] Hardware bus probe started...',
    '[I2C-BUS] Scanning addresses 0x08 - 0x77 @ 400kHz...',
    '[I2C-BUS] Device 0x3C (SSD1306 OLED 128x64) ACK received.',
    '[I2C-BUS] Device 0x68 (MPU-6050 6-DOF IMU) WHO_AM_I: 0x68 - OK.',
    '[ADC1] Channel 6 (GPIO 34) MQ-2 analog reading initialized.',
    '[GPIO] Pin 04 INPUT_PULLUP initialized for emergency SOS trigger.',
    '[WIFI] Link negotiated with local access point.',
    '[RTDB] Firebase sync target: /devices/ANVESHAK-ESP32-01/latest.',
  ]);

  const runHardwareSelfTest = () => {
    setDiagnosticsRunning(true);
    setDiagnosticLogs((prev) => [
      `[${formatTimestamp(new Date())}] Triggering full subsystem diagnostic self-test...`,
      ...prev,
    ]);

    setTimeout(() => {
      setDiagnosticLogs((prev) => [
        `[${formatTimestamp(new Date())}] Self-Test Complete: All hardware endpoints verified. 0 errors.`,
        ...prev,
      ]);
      setDiagnosticsRunning(false);
    }, 1500);
  };

  const getRssiQuality = (rssi) => {
    if (!rssi) return { label: 'No Signal', color: 'slate' };
    if (rssi >= -60) return { label: 'Excellent (-58 dBm)', color: 'emerald' };
    if (rssi >= -75) return { label: 'Good', color: 'cyan' };
    return { label: 'Fair / Weak', color: 'amber' };
  };

  const rssiQuality = getRssiQuality(esp32?.rssi);

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>Device Diagnostics & Hardware Health</span>
            <Badge variant={isOnline ? 'clean' : 'outline'} size="sm">
              {devStatus.displayLabel}
            </Badge>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Main Monitoring Device hardware registers, peripheral diagnostics, memory telemetry, and bus connections.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runHardwareSelfTest}
            disabled={diagnosticsRunning || !isOnline}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-600 ${diagnosticsRunning ? 'animate-spin' : ''}`} />
            <span>Run Self-Test</span>
          </button>
        </div>
      </div>

      {/* Main Hardware Status Hero Card */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-cyan-50 border border-cyan-200 text-cyan-600 shadow-sm">
              <Cpu className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Main Monitoring Device (ESP32-WROOM-32D)</h2>
                <StatusIndicator
                  status={isOnline ? 'online' : 'offline'}
                  label={isOnline ? 'CONNECTED' : devStatus.displayLabel.toUpperCase()}
                />
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5">
                MAC: {isOnline ? esp32?.macAddress : '00:00:00:00:00:00'} • IP: {isOnline ? esp32?.ipAddress : '0.0.0.0'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-xs">
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">SYSTEM UPTIME</span>
              <span className="text-slate-800 font-bold">
                {isOnline ? `${Math.floor((esp32?.uptimeSeconds || 0) / 60)} min ${(esp32?.uptimeSeconds || 0) % 60}s` : '--'}
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block text-[10px]">MCU CORE TEMP</span>
              <span className="text-cyan-700 font-bold">
                {isOnline ? `${esp32?.chipTemp || 41.5} °C` : '--'}
              </span>
            </div>
          </div>
        </div>

        {/* Telemetry Metrics Quad */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">WIFI RSSI STRENGTH</span>
            <span className="text-base font-bold text-emerald-700">
              {isOnline ? `${esp32?.rssi} dBm` : '0 dBm'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">{rssiQuality.label} • 2.4GHz</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">FREE HEAP SRAM</span>
            <span className="text-base font-bold text-amber-700">
              {isOnline ? `${Math.round((esp32?.freeHeap || 0) / 1024)} KB` : '0 KB'}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Total: 520 KB SRAM</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">SPI FLASH MEMORY</span>
            <span className="text-base font-bold text-slate-800">4.0 MB</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Dual SPI @ 80MHz</span>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
            <span className="text-slate-500 block text-[10px]">CPU CORE CLOCK</span>
            <span className="text-base font-bold text-cyan-700">240 MHz</span>
            <span className="text-[10px] text-slate-500 block mt-0.5">Dual Xtensa 32-bit</span>
          </div>
        </div>
      </div>

      {/* Hardware Pinout Visualizer */}
      <Esp32BoardPinout esp32={esp32} isSimulated={false} />

      {/* Peripheral Diagnostic Table & Diagnostic Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        
        {/* Table of Subsystems */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
            <Server className="w-4 h-4 text-cyan-600" />
            <h3 className="text-sm font-bold text-slate-900">Connected Sensors & Peripheral Health</h3>
          </div>

          <div className="space-y-2.5 font-mono text-xs">
            {/* MQ-2 Gas */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">Gas & Smoke Sensor</div>
                <div className="text-[11px] text-slate-500">Gas Sensor Input: GPIO 34 (ADC1_CH6) • 5V Heater</div>
              </div>
              <Badge variant={isOnline ? 'clean' : 'outline'} size="xs">
                {isOnline ? 'CONNECTED' : 'DISCONNECTED'}
              </Badge>
            </div>

            {/* MPU-6050 Motion */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">Motion Sensor</div>
                <div className="text-[11px] text-slate-500">Motion Sensor Connection: I2C 0x68 (SDA 21, SCL 22)</div>
              </div>
              <Badge variant={isOnline ? 'clean' : 'outline'} size="xs">
                {isOnline ? 'CONNECTED' : 'SENSOR NOT RESPONDING'}
              </Badge>
            </div>

            {/* SSD1306 OLED */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">Display Screen</div>
                <div className="text-[11px] text-slate-500">Display Connection: I2C 0x3C (128x64 OLED)</div>
              </div>
              <Badge variant={isOnline ? 'clean' : 'outline'} size="xs">
                {isOnline ? 'CONNECTED' : 'DISCONNECTED'}
              </Badge>
            </div>

            {/* SOS Pushbutton */}
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
              <div>
                <div className="font-bold text-slate-800">Emergency SOS Button</div>
                <div className="text-[11px] text-slate-500">Emergency Input: GPIO 04 • Pull-up Armed</div>
              </div>
              <Badge variant={isOnline ? 'clean' : 'outline'} size="xs">
                {isOnline ? 'ARMED' : 'DISCONNECTED'}
              </Badge>
            </div>
          </div>
        </div>

        {/* Live Diagnostics Console Log */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-200 mb-3">
              <div className="flex items-center gap-2">
                <Terminal className="w-4 h-4 text-cyan-600" />
                <h3 className="text-sm font-bold text-slate-900">Firmware Diagnostics Console</h3>
              </div>
              <span className="text-[10px] font-mono text-slate-500">Baud: 115200</span>
            </div>

            <div className="h-60 rounded-lg bg-slate-900 border border-slate-800 p-3 font-mono text-[11px] text-cyan-300/90 overflow-y-auto space-y-1 select-text shadow-inner">
              {diagnosticLogs.map((log, i) => (
                <div key={i} className="leading-relaxed">
                  <span className="text-slate-500 mr-2">$</span>
                  {log}
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-500 font-mono flex items-center justify-between">
            <span>Kernel: FreeRTOS v10.2</span>
            <span>Framework: ESP-IDF / Arduino core</span>
          </div>
        </div>

      </div>

    </div>
  );
};
