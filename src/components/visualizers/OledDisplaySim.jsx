import React, { useState } from 'react';
import { Tv, ChevronRight, AlertTriangle, Wifi } from 'lucide-react';
import { formatTimestamp } from '../../utils/formatters';

export const OledDisplaySim = ({ packet }) => {
  const [screenPage, setScreenPage] = useState(0); // 0: Gas & Temp, 1: MPU-6050, 2: WiFi & System

  if (!packet) return null;

  const isOnline = packet.esp32?.isOnline;
  const isSos = packet.sosActive;
  const isGasCritical = (packet.mq2?.rawAdc || 0) >= 1000;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Tv className="w-4 h-4 text-cyan-600" />
          <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
            Display Screen Output
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-slate-500 uppercase">128x64 Screen</span>
          <button
            onClick={() => setScreenPage((p) => (p + 1) % 3)}
            title="Cycle OLED screen page"
            className="px-2 py-0.5 text-[10px] font-mono bg-slate-50 hover:bg-slate-100 text-cyan-700 rounded border border-slate-300 flex items-center gap-0.5 transition-colors shadow-sm font-semibold"
          >
            Page {screenPage + 1}/3 <ChevronRight className="w-2.5 h-2.5" />
          </button>
        </div>
      </div>

      {/* Physical OLED Bezel and Display Area */}
      <div className="relative mx-auto w-full max-w-[340px] rounded-lg bg-black p-3.5 border-2 border-slate-700 shadow-inner">
        {/* Subtle glass reflection & scanlines */}
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-cyan-500/5 to-transparent pointer-events-none rounded-lg" />
        <div className="relative aspect-[2/1] w-full rounded bg-[#02070D] border border-cyan-950 p-2 font-mono text-cyan-300 select-none overflow-hidden flex flex-col justify-between shadow-[inset_0_0_12px_rgba(6,182,212,0.15)]">
          
          {/* Header Row on OLED */}
          <div className="flex items-center justify-between border-b border-cyan-800/40 pb-1 text-[11px] leading-tight">
            <span className="font-bold tracking-wider text-cyan-200">ANVESHAK v1.2</span>
            <div className="flex items-center gap-1.5 text-[10px]">
              {isOnline ? (
                <>
                  <Wifi className="w-2.5 h-2.5 text-cyan-400" />
                  <span>{packet.esp32?.rssi}dB</span>
                </>
              ) : (
                <span className="text-red-400">OFFLINE</span>
              )}
            </div>
          </div>

          {/* Body Content based on State & Page */}
          {isSos ? (
            <div className="flex flex-col items-center justify-center my-auto bg-red-950/40 border border-red-500/40 rounded p-1 text-center animate-pulse">
              <span className="text-[12px] font-extrabold text-red-300 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> ** EMERGENCY SOS **
              </span>
              <span className="text-[10px] text-red-200 mt-0.5">ALERT TRANSMITTED!</span>
            </div>
          ) : isGasCritical ? (
            <div className="flex flex-col items-center justify-center my-auto bg-amber-950/40 border border-amber-500/40 rounded p-1 text-center animate-pulse">
              <span className="text-[11px] font-bold text-amber-300">! DANGER: GAS SPIKE !</span>
              <span className="text-[10px] text-amber-200 mt-0.5">
                ADC: {packet.mq2?.rawAdc} | {packet.mq2?.ppm} PPM
              </span>
            </div>
          ) : !isOnline ? (
            <div className="flex flex-col items-center justify-center my-auto text-slate-400 text-center">
              <span className="text-[11px]">WAITING FOR MCU...</span>
              <span className="text-[9px] mt-1 text-slate-500">SCREEN STANDBY</span>
            </div>
          ) : screenPage === 0 ? (
            /* Page 1: Gas & Temp */
            <div className="grid grid-cols-2 gap-1 my-auto text-[11px]">
              <div>
                <div className="text-[9px] text-cyan-400/80">GAS & SMOKE:</div>
                <div className="font-bold text-cyan-100">{packet.mq2?.rawAdc} ADC</div>
                <div className="text-[9px] text-cyan-300">{packet.mq2?.ppm} PPM</div>
              </div>
              <div className="border-l border-cyan-800/40 pl-2">
                <div className="text-[9px] text-cyan-400/80">TEMPERATURE:</div>
                <div className="font-bold text-cyan-100">{packet.mpu6050?.tempC}°C</div>
                <div className="text-[9px] text-cyan-300">{((packet.mpu6050?.tempC * 9)/5 + 32).toFixed(1)}°F</div>
              </div>
            </div>
          ) : screenPage === 1 ? (
            /* Page 2: MPU-6050 Accel & Gyro */
            <div className="my-auto text-[10px] space-y-0.5">
              <div className="flex justify-between text-cyan-200 font-semibold">
                <span>ACCEL (g):</span>
                <span>X:{packet.mpu6050?.accel?.x} Y:{packet.mpu6050?.accel?.y} Z:{packet.mpu6050?.accel?.z}</span>
              </div>
              <div className="flex justify-between text-cyan-300">
                <span>GYRO (°/s):</span>
                <span>X:{packet.mpu6050?.gyro?.x} Y:{packet.mpu6050?.gyro?.y}</span>
              </div>
              <div className="flex justify-between text-[9px] text-cyan-400/90 pt-0.5 border-t border-cyan-800/30">
                <span>TILT: R:{packet.mpu6050?.roll}° P:{packet.mpu6050?.pitch}°</span>
                <span className="text-emerald-300 font-bold">STATUS: OK</span>
              </div>
            </div>
          ) : (
            /* Page 3: WiFi & Device Info */
            <div className="my-auto text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span className="text-cyan-400">IP:</span>
                <span className="text-cyan-100">{packet.esp32?.ipAddress}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-cyan-400">HEAP:</span>
                <span className="text-cyan-100">{Math.round((packet.esp32?.freeHeap || 0) / 1024)} KB</span>
              </div>
              <div className="flex justify-between text-[9px] text-cyan-300">
                <span>UPTIME: {Math.floor((packet.esp32?.uptimeSeconds || 0) / 60)}m</span>
                <span>RTDB SYNC: OK</span>
              </div>
            </div>
          )}

          {/* Footer Bar on OLED */}
          <div className="flex items-center justify-between border-t border-cyan-800/40 pt-0.5 text-[9px] text-cyan-400/70">
            <span>UP: {packet.esp32?.uptimeSeconds}s</span>
            <span>{formatTimestamp(packet.timestamp)}</span>
          </div>

        </div>
      </div>

      <div className="mt-2 text-center text-[11px] text-slate-400 font-mono">
        Real-time mirror of device display screen
      </div>
    </div>
  );
};
