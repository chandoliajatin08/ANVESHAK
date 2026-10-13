import React from 'react';

export const StatusIndicator = ({ status = 'online', label, size = 'md', pulse = true, className = '' }) => {
  const sizeMap = {
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3.5 h-3.5',
  };

  const colorMap = {
    online: 'bg-emerald-500 shadow-glow-green',
    normal: 'bg-emerald-500 shadow-glow-green',
    warning: 'bg-amber-500 shadow-glow-amber',
    critical: 'bg-red-500 shadow-glow-red animate-pulse-fast',
    danger: 'bg-red-500 shadow-glow-red animate-pulse-fast',
    offline: 'bg-slate-400',
    simulated: 'bg-cyan-500 shadow-glow-cyan',
    connecting: 'bg-sky-500 animate-ping-slow',
  };

  const selectedSize = sizeMap[size] || sizeMap.md;
  const selectedColor = colorMap[status.toLowerCase()] || 'bg-slate-400';

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className="relative flex items-center justify-center">
        {pulse && (status === 'online' || status === 'critical' || status === 'simulated') && (
          <span
            className={`absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping ${selectedColor}`}
          />
        )}
        <span className={`relative inline-flex rounded-full ${selectedSize} ${selectedColor}`} />
      </span>
      {label && <span className="text-xs font-semibold tracking-wide uppercase text-slate-700">{label}</span>}
    </div>
  );
};
