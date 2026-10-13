import React from 'react';

export const Badge = ({
  variant = 'default',
  children,
  size = 'md',
  className = '',
  icon: Icon = null,
}) => {
  const sizeClasses = {
    xs: 'px-1.5 py-0.5 text-[10px] tracking-wide font-mono',
    sm: 'px-2 py-0.5 text-xs font-mono',
    md: 'px-2.5 py-1 text-xs font-medium',
    lg: 'px-3 py-1.5 text-sm font-semibold',
  };

  const variantClasses = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    clean: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    normal: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200 shadow-sm',
    critical: 'bg-red-50 text-red-700 border border-red-200 shadow-sm animate-pulse-fast',
    danger: 'bg-red-50 text-red-700 border border-red-200 shadow-sm',
    cyan: 'bg-cyan-50 text-cyan-700 border border-cyan-200 shadow-sm',
    info: 'bg-sky-50 text-sky-700 border border-sky-200',
    outline: 'bg-white text-slate-600 border border-slate-300',
    simulated: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded uppercase font-semibold ${sizeClasses[size] || sizeClasses.md} ${variantClasses[variant] || variantClasses.default} ${className}`}
    >
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      {children}
    </span>
  );
};
