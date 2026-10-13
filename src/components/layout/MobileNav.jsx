import React from 'react';
import { X, Activity } from 'lucide-react';
import { NAV_ITEMS } from './navConfig';
import { useTelemetry } from '../../context/TelemetryContext';

export const MobileNav = ({ isOpen, onClose, activePage, onSelectPage }) => {
  const { alerts } = useTelemetry();
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 p-5 flex flex-col justify-between shadow-2xl z-10" aria-label="Mobile navigation drawer">
        <div>
          {/* Drawer Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-600 flex items-center justify-center text-white shadow-sm">
                <Activity className="w-5 h-5" />
              </div>
              <span className="font-bold text-lg text-slate-900">ANVESHAK</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Close navigation menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectPage(item.id);
                    onClose();
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl font-medium text-sm transition-colors ${
                    isActive
                      ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold shadow-sm'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-cyan-600' : 'text-slate-400'}`} />
                    <span>{item.label}</span>
                  </div>

                  {item.hasBadge && unacknowledgedCount > 0 && (
                    <span className="px-2 py-0.5 text-xs font-mono font-bold rounded-full bg-red-600 text-white shadow-sm">
                      {unacknowledgedCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="text-center font-mono text-xs text-slate-400 pt-4 border-t border-slate-200">
          ANVESHAK Safety Monitoring System
        </div>
      </aside>
    </div>
  );
};
