import React from 'react';
import { Cpu, Radio, Zap } from 'lucide-react';

export const Esp32BoardPinout = ({ esp32, isSimulated = false }) => {
  const isOnline = esp32?.isOnline;

  const pins = [
    {
      pin: 'GPIO 34',
      name: 'MQ-2 Analog In',
      type: 'ADC1_CH6',
      bus: 'Analog (0-3.3V)',
      status: isOnline ? 'ACTIVE' : 'OFFLINE',
      color: 'cyan',
    },
    {
      pin: 'GPIO 21',
      name: 'I2C SDA (Data)',
      type: 'Shared I2C',
      bus: '0x68 (MPU) & 0x3C (OLED)',
      status: isOnline ? 'SYNCED' : 'OFFLINE',
      color: 'emerald',
    },
    {
      pin: 'GPIO 22',
      name: 'I2C SCL (Clock)',
      type: 'Shared I2C',
      bus: '400 kHz Fast-Mode',
      status: isOnline ? 'SYNCED' : 'OFFLINE',
      color: 'emerald',
    },
    {
      pin: 'GPIO 04',
      name: 'SOS Pushbutton',
      type: 'Interrupt (INPUT_PULLUP)',
      bus: 'Digital Active-LOW',
      status: isOnline ? 'READY' : 'OFFLINE',
      color: 'amber',
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-lg bg-cyan-50 border border-cyan-200 text-cyan-600 shadow-sm">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              ESP32 DevKit V1 Hardware Pinout & Bus Matrix
              {isSimulated && (
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                  SIMULATED
                </span>
              )}
            </h4>
            <div className="text-xs text-slate-500 font-mono">
              Xtensa Dual-Core 32-bit LX6 @ 240MHz • 520 KB SRAM
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200">
            <Radio className="w-3.5 h-3.5 text-cyan-600" />
            <span className="text-slate-500">RSSI:</span>
            <span className="text-cyan-700 font-bold">{isOnline ? `${esp32?.rssi} dBm` : '--'}</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-50 border border-slate-200">
            <Zap className="w-3.5 h-3.5 text-amber-600" />
            <span className="text-slate-500">Heap:</span>
            <span className="text-amber-700 font-bold">
              {isOnline ? `${Math.round((esp32?.freeHeap || 0) / 1024)} KB` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Pin Bus Table */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        {pins.map((p) => (
          <div
            key={p.pin}
            className="p-3 rounded-lg bg-slate-50 border border-slate-200 hover:border-slate-300 transition-colors font-mono"
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="font-bold text-cyan-700">{p.pin}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded font-bold ${
                  p.status === 'ACTIVE' || p.status === 'SYNCED' || p.status === 'READY'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-slate-200 text-slate-600'
                }`}
              >
                {p.status}
              </span>
            </div>
            <div className="text-xs text-slate-800 font-sans font-semibold">{p.name}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">{p.type}</div>
            <div className="text-[10px] text-slate-400 mt-1 truncate">{p.bus}</div>
          </div>
        ))}
      </div>
    </div>
  );
};
