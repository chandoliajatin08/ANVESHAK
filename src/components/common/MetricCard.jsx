import React from 'react';
import { Badge } from './Badge';

export const MetricCard = ({
  title,
  icon: Icon,
  badgeText,
  badgeVariant = 'normal',
  value,
  unit,
  subvalue,
  sublabel,
  children,
  alertLevel = 'normal', // 'normal' | 'warning' | 'critical'
  onClick,
  className = '',
}) => {
  const borderAlertStyles = {
    normal: 'border-slate-200 hover:border-slate-300',
    warning: 'border-amber-300 bg-amber-50/20 shadow-sm',
    critical: 'border-red-300 bg-red-50/20 shadow-sm animate-pulse-fast',
  };

  return (
    <div
      onClick={onClick}
      className={`relative overflow-hidden rounded-xl bg-white p-5 border shadow-sm transition-all duration-300 ${borderAlertStyles[alertLevel] || borderAlertStyles.normal} ${className}`}
    >
      {/* Background subtle radial accent */}
      <div className="absolute top-0 right-0 -mr-16 -mt-16 w-32 h-32 rounded-full bg-cyan-500/5 blur-2xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className={`p-2 rounded-lg bg-slate-100 border border-slate-200 ${
              alertLevel === 'critical' ? 'text-red-600' : alertLevel === 'warning' ? 'text-amber-600' : 'text-cyan-600'
            }`}>
              <Icon className="w-5 h-5" />
            </div>
          )}
          <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
            {title}
          </span>
        </div>
        {badgeText && (
          <Badge variant={badgeVariant} size="sm">
            {badgeText}
          </Badge>
        )}
      </div>

      {/* Main Metric Value */}
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-3xl font-extrabold font-mono tracking-tight text-slate-900">
          {value}
        </span>
        {unit && (
          <span className="text-sm font-semibold font-mono text-slate-500 uppercase">
            {unit}
          </span>
        )}
      </div>

      {/* Subvalue / Description */}
      {(subvalue || sublabel) && (
        <div className="flex items-center justify-between text-xs text-slate-500 font-mono mt-1 mb-2">
          <span>{sublabel}</span>
          <span className="text-slate-800 font-semibold">{subvalue}</span>
        </div>
      )}

      {/* Custom slotted element (chart, bars, etc.) */}
      {children && <div className="mt-3 pt-3 border-t border-slate-100">{children}</div>}
    </div>
  );
};
