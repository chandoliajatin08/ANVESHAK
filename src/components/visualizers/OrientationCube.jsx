import React from 'react';
import { Compass } from 'lucide-react';
import { calculateGForce } from '../../utils/formatters';

export const OrientationCube = ({ roll = 0, pitch = 0, accel = { x: 0, y: 0, z: 1 } }) => {
  const gForce = calculateGForce(accel.x || 0, accel.y || 0, accel.z || 0);

  // Clamp visual angles to prevent dizzy spinning
  const displayRoll = Math.max(-90, Math.min(90, roll || 0));
  const displayPitch = Math.max(-90, Math.min(90, pitch || 0));

  const isExtremeTilt = Math.abs(roll) > 45 || Math.abs(pitch) > 45;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Compass className="w-4 h-4 text-cyan-600" />
          <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
            Motion Sensor 3D Orientation
          </span>
        </div>
        <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded shadow-sm ${
          isExtremeTilt ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }`}>
          {isExtremeTilt ? 'TILT EXCEEDED' : 'ORIENTATION NORMAL'}
        </span>
      </div>

      {/* 3D Scene Viewport */}
      <div className="relative h-48 w-full flex items-center justify-center overflow-hidden rounded-lg bg-slate-50 border border-slate-200 [perspective:700px]">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none" />

        {/* Dynamic 3D PCB Board */}
        <div
          className="relative transition-transform duration-300 ease-out [transform-style:preserve-3d]"
          style={{
            transform: `rotateX(${-displayPitch}deg) rotateZ(${-displayRoll}deg) rotateY(15deg)`,
          }}
        >
          {/* Main PCB Slab */}
          <div className="w-40 h-28 rounded-md bg-emerald-900/90 border-2 border-emerald-400/80 shadow-[0_15px_30px_rgba(0,0,0,0.35)] flex flex-col items-center justify-between p-2.5 relative select-none">
            {/* PCB Trace accents */}
            <div className="absolute top-2 left-2 right-2 h-0.5 bg-emerald-400/30" />
            <div className="absolute bottom-2 left-2 right-2 h-0.5 bg-emerald-400/30" />

            {/* MPU-6050 QFN chip */}
            <div className="w-14 h-14 rounded bg-slate-900 border border-slate-600 flex flex-col items-center justify-center shadow-md">
              <span className="text-[7px] font-mono text-slate-400">Motion</span>
              <span className="text-[8px] font-mono font-bold text-cyan-400">Sensor</span>
              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-0.5" />
            </div>

            <div className="w-full flex justify-between items-center text-[8px] font-mono text-emerald-300/80 font-bold px-1">
              <span>VCC GND SCL SDA</span>
              <span>XDA XCL AD0 INT</span>
            </div>

            {/* Axis Indicator Overlays on board */}
            <div className="absolute -top-4 text-[9px] font-mono text-cyan-400 font-bold">+Y (Pitch)</div>
            <div className="absolute -right-5 text-[9px] font-mono text-red-400 font-bold">+X (Roll)</div>
          </div>
        </div>

        {/* Artificial Horizon Ring Watermark */}
        <div className="absolute bottom-2 right-2 text-right font-mono text-[10px] text-slate-600 bg-white/90 px-2 py-1 rounded border border-slate-200 shadow-sm">
          <div>G-Force: <span className="text-slate-900 font-bold">{gForce.toFixed(2)}g</span></div>
          <div>Net Vector: <span className="text-cyan-700 font-bold">{Math.round(gForce * 9.81)} m/s²</span></div>
        </div>
      </div>

      {/* Numerical Attitude Readouts */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t border-slate-200 text-center font-mono">
        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">ROLL (X)</div>
          <div className="text-sm font-bold text-slate-800">{roll}°</div>
        </div>
        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">PITCH (Y)</div>
          <div className="text-sm font-bold text-slate-800">{pitch}°</div>
        </div>
        <div className="p-1.5 rounded bg-slate-50 border border-slate-200">
          <div className="text-[10px] text-slate-500">G-FORCE</div>
          <div className={`text-sm font-bold ${gForce > 2.0 ? 'text-red-600' : 'text-emerald-700'}`}>
            {gForce.toFixed(2)}g
          </div>
        </div>
      </div>
    </div>
  );
};
