import React from 'react';
import { useTelemetry } from '../../context/TelemetryContext';
import { NAV_ITEMS } from './navConfig';

export const Sidebar = ({ activePage, onSelectPage }) => {
  const { alerts } = useTelemetry();
  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  return (
    <aside className="hidden lg:flex flex-col w-60 bg-slate-50 border-r border-slate-200 p-4 shrink-0 justify-between select-none min-h-[calc(100vh-53px)]">
      <div>
        <div className="text-[11px] font-mono font-semibold tracking-wider text-slate-500 uppercase mb-3 px-3">
          Navigation
        </div>

        <nav className="space-y-1" aria-label="Main sidebar navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl font-medium text-sm transition-all duration-150 ${
                  isActive
                    ? 'bg-cyan-50 text-cyan-700 border border-cyan-200 font-semibold shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-cyan-600' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                {item.hasBadge && unacknowledgedCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-mono font-bold rounded-full bg-red-600 text-white shadow-sm">
                    {unacknowledgedCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="pt-3 border-t border-slate-200 text-[11px] text-slate-400 font-mono text-center">
        ANVESHAK v1.2
      </div>
    </aside>
  );
};
