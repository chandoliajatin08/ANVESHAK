import React from 'react';
import { Wind } from 'lucide-react';
import { formatADC, formatPPM, getGasStatus } from '../../utils/formatters';

export const GasGauge = ({ adc = 0, ppm = 0, voltage = 0, warningThreshold = 1200, criticalThreshold = 2400 }) => {
  const clampedAdc = Math.max(0, Math.min(4095, adc || 0));
  const percentage = (clampedAdc / 4095) * 100;
  const status = getGasStatus(clampedAdc, { warning: warningThreshold, critical: criticalThreshold });

  // Angle calculations for 180° semi-circle arc (from -180° to 0°)
  const angle = (clampedAdc / 4095) * 180 - 180;

  // Arc path constants
  const cx = 90;
  const cy = 85;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col justify-between">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Wind className="w-4 h-4 text-cyan-600" />
          <span className="text-xs font-semibold tracking-wider text-slate-700 uppercase">
            Gas & Smoke Sensor Dial
          </span>
        </div>
        <span
          className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded ${
            status.level === 'critical'
              ? 'bg-red-50 text-red-700 border border-red-200 animate-pulse-fast'
              : status.level === 'warning'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
          }`}
        >
          {status.label}
        </span>
      </div>

      {/* SVG Semi-Circle Dial */}
      <div className="relative flex flex-col items-center justify-center my-1">
        <svg viewBox="0 0 180 105" className="w-48 overflow-visible">
          {/* Background track */}
          <path
            d="M 20 85 A 70 70 0 0 1 160 85"
            fill="none"
            stroke="#E2E8F0"
            strokeWidth="14"
            strokeLinecap="round"
          />

          {/* Green zone (0 - warning) */}
          <path
            d="M 20 85 A 70 70 0 0 1 80 20"
            fill="none"
            stroke="rgba(16, 185, 129, 0.4)"
            strokeWidth="14"
            strokeDasharray="2 3"
          />

          {/* Amber zone */}
          <path
            d="M 80 20 A 70 70 0 0 1 125 32"
            fill="none"
            stroke="rgba(245, 158, 11, 0.4)"
            strokeWidth="14"
            strokeDasharray="2 3"
          />

          {/* Red zone */}
          <path
            d="M 125 32 A 70 70 0 0 1 160 85"
            fill="none"
            stroke="rgba(239, 68, 68, 0.5)"
            strokeWidth="14"
            strokeDasharray="2 3"
          />

          {/* Active progress arc */}
          <path
            d="M 20 85 A 70 70 0 0 1 160 85"
            fill="none"
            stroke={
              status.level === 'critical' ? '#EF4444' : status.level === 'warning' ? '#F59E0B' : '#10B981'
            }
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray="220"
            strokeDashoffset={220 - (percentage / 100) * 220}
            className="transition-all duration-300"
          />

          {/* Needle pivot and needle */}
          <g transform={`translate(${cx}, ${cy}) rotate(${angle + 90})`}>
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="-62"
              stroke="#0F172A"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="transition-transform duration-300"
            />
            <circle cx="0" cy="0" r="6" fill="#0F172A" stroke="#06B6D4" strokeWidth="2.5" />
          </g>

          {/* Threshold markers text */}
          <text x="15" y="100" fill="#64748B" fontSize="8" fontFamily="monospace">0</text>
          <text x="75" y="15" fill="#D97706" fontSize="7" fontFamily="monospace">WARN: 1200</text>
          <text x="130" y="25" fill="#DC2626" fontSize="7" fontFamily="monospace">CRIT: 2400</text>
          <text x="150" y="100" fill="#64748B" fontSize="8" fontFamily="monospace">4095</text>
        </svg>

        {/* Center reading value */}
        <div className="text-center -mt-3">
          <div className="text-2xl font-black font-mono tracking-tight text-slate-900">
            {formatADC(clampedAdc)} <span className="text-xs text-slate-500 font-normal">ADC</span>
          </div>
          <div className="text-xs font-mono font-semibold text-cyan-700">
            {formatPPM(ppm)} • {voltage ? `${voltage.toFixed(2)}V` : '--'}
          </div>
        </div>
      </div>

      {/* Target Chemical Sensitivity Chips */}
      <div className="grid grid-cols-4 gap-1 mt-3 pt-2 border-t border-slate-200 text-center font-mono text-[9px]">
        <div className="p-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
          <div>LPG / Propane</div>
          <span className="text-cyan-700 font-bold">DETECT</span>
        </div>
        <div className="p-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
          <div>Smoke / Fire</div>
          <span className="text-cyan-700 font-bold">DETECT</span>
        </div>
        <div className="p-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
          <div>Methane (CH4)</div>
          <span className="text-cyan-700 font-bold">DETECT</span>
        </div>
        <div className="p-1 rounded bg-slate-50 border border-slate-200 text-slate-700">
          <div>Alcohol / CO</div>
          <span className="text-cyan-700 font-bold">DETECT</span>
        </div>
      </div>
    </div>
  );
};
