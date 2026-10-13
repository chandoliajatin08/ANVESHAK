import React, { useState } from 'react';
import {
  AlertOctagon,
  CheckCircle2,
  Filter,
  Download,
  Trash2,
  Flame,
  Activity,
  Info,
  Clock,
} from 'lucide-react';
import { useTelemetry } from '../context/TelemetryContext';
import { Badge } from '../components/common/Badge';
import { Modal } from '../components/common/Modal';
import { formatDateTime } from '../utils/formatters';

export const AlertsSos = () => {
  const {
    alerts,
    latestPacket,
    acknowledgeAlert,
    acknowledgeAllAlerts,
    clearAlertHistory,
  } = useTelemetry();

  const [severityFilter, setSeverityFilter] = useState('all'); // 'all' | 'critical' | 'warning' | 'info'
  const [sensorFilter, setSensorFilter] = useState('all'); // 'all' | 'MQ-2' | 'MPU-6050' | 'SOS_BUTTON' | 'SYSTEM'
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'unack' | 'ack'
  const [selectedIncident, setSelectedIncident] = useState(null);

  const isSos = latestPacket?.sosActive;

  // Filter alerts
  const filteredAlerts = alerts.filter((alert) => {
    if (severityFilter !== 'all' && alert.severity !== severityFilter) return false;
    if (sensorFilter !== 'all' && alert.sensor !== sensorFilter) return false;
    if (statusFilter === 'unack' && alert.acknowledged) return false;
    if (statusFilter === 'ack' && !alert.acknowledged) return false;
    return true;
  });

  const exportAlertsJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(alerts, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `ANVESHAK_Incidents_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6">
      
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl lg:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3">
            <span>Alerts & SOS</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-semibold shadow-sm">
              {alerts.filter((a) => !a.acknowledged).length} PENDING ACK
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Active safety event logging, emergency SOS incident tracking, and threshold audits.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={acknowledgeAllAlerts}
            disabled={alerts.length === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50 font-medium"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Acknowledge All</span>
          </button>
          <button
            onClick={exportAlertsJSON}
            disabled={alerts.length === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm flex items-center gap-1.5 transition-colors disabled:opacity-50 font-medium"
          >
            <Download className="w-3.5 h-3.5 text-cyan-600" />
            <span>Export Log</span>
          </button>
          <button
            onClick={clearAlertHistory}
            disabled={alerts.length === 0}
            className="px-3 py-1.5 text-xs rounded-lg bg-white hover:bg-red-50 text-slate-500 hover:text-red-600 border border-slate-300 shadow-sm transition-colors disabled:opacity-50"
            title="Clear all alerts"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Emergency SOS Callout Box */}
      <div
        className={`p-6 rounded-2xl border transition-all shadow-sm ${
          isSos
            ? 'bg-red-50 border-red-400 shadow-glow-red animate-pulse-fast'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div
              className={`p-3.5 rounded-2xl border ${
                isSos
                  ? 'bg-red-600 text-white border-red-500 animate-bounce'
                  : 'bg-slate-100 text-red-600 border-slate-200 shadow-sm'
              }`}
            >
              <AlertOctagon className="w-8 h-8" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-wide">
                  {isSos ? '🚨 EMERGENCY SOS IN PROGRESS' : 'Emergency SOS Trigger'}
                </h2>
                <Badge variant={isSos ? 'critical' : 'outline'} size="sm">
                  {isSos ? 'ACTIVE INCIDENT' : 'STANDBY'}
                </Badge>
              </div>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                {isSos
                  ? 'Emergency alert actively received from physical ESP32 monitoring device via GPIO 04 interrupt. Immediate safety protocol initiated.'
                  : 'Monitored continuously via physical ESP32 emergency SOS button (GPIO 04 Active-LOW interrupt).'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div
              className={`px-4 py-2.5 rounded-xl font-bold font-mono text-xs flex items-center gap-2 border ${
                isSos
                  ? 'bg-red-600 text-white border-red-500 shadow-glow-red animate-pulse'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isSos ? 'bg-white animate-ping' : 'bg-emerald-500'
                }`}
              />
              <span>{isSos ? 'EMERGENCY TRANSMISSION ACTIVE' : 'HARDWARE STANDBY (GPIO 04)'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <Filter className="w-4 h-4 text-cyan-600" />
          <span className="font-semibold text-slate-800">Filters:</span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
          {/* Severity */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Severity:</span>
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical Only</option>
              <option value="warning">Warning Only</option>
              <option value="info">Info Only</option>
            </select>
          </div>

          {/* Sensor */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Sensor:</span>
            <select
              value={sensorFilter}
              onChange={(e) => setSensorFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
            >
              <option value="all">All Sensors</option>
              <option value="MQ-2">Gas & Smoke Sensor</option>
              <option value="MPU-6050">Motion Sensor</option>
              <option value="SOS_BUTTON">Emergency SOS Button</option>
              <option value="SYSTEM">Main Monitoring Device</option>
            </select>
          </div>

          {/* Ack Status */}
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 rounded bg-slate-50 text-slate-800 border border-slate-300 focus:outline-none focus:border-cyan-500 focus:bg-white"
            >
              <option value="all">All Statuses</option>
              <option value="unack">Pending ACK</option>
              <option value="ack">Acknowledged</option>
            </select>
          </div>
        </div>
      </div>

      {/* Incidents Table / Cards */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {filteredAlerts.length === 0 ? (
          <div className="py-16 text-center text-slate-500 font-mono text-xs">
            No incident records match the active filter criteria.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredAlerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 transition-colors flex flex-wrap items-center justify-between gap-4 ${
                  alert.severity === 'critical'
                    ? 'hover:bg-red-50/40'
                    : alert.severity === 'warning'
                    ? 'hover:bg-amber-50/40'
                    : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    {alert.sensor === 'MQ-2' ? (
                      <Flame className="w-5 h-5 text-amber-500" />
                    ) : alert.sensor === 'MPU-6050' ? (
                      <Activity className="w-5 h-5 text-cyan-600" />
                    ) : alert.sensor === 'SOS_BUTTON' ? (
                      <AlertOctagon className="w-5 h-5 text-red-600" />
                    ) : (
                      <Info className="w-5 h-5 text-sky-600" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{alert.title}</span>
                      <Badge variant={alert.severity} size="xs">
                        {alert.severity}
                      </Badge>
                      <span className="text-[10px] font-mono text-slate-500 px-1.5 py-0.5 rounded bg-slate-50 border border-slate-200">
                        {alert.sensor === 'MQ-2'
                          ? 'Gas & Smoke'
                          : alert.sensor === 'MPU-6050'
                          ? 'Motion'
                          : alert.sensor === 'SOS_BUTTON'
                          ? 'SOS Button'
                          : 'Main Device'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-1">{alert.message}</div>
                    <div className="text-[11px] text-slate-500 font-mono mt-1 flex items-center gap-2">
                      <Clock className="w-3 h-3" />
                      <span>{formatDateTime(alert.timestamp)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedIncident(alert)}
                    className="px-2.5 py-1 text-xs rounded bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 shadow-sm font-medium transition-colors"
                  >
                    Details
                  </button>
                  {!alert.acknowledged ? (
                    <button
                      onClick={() => acknowledgeAlert(alert.id)}
                      className="px-3 py-1 text-xs rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold shadow-sm transition-colors"
                    >
                      Acknowledge
                    </button>
                  ) : (
                    <span className="text-xs text-emerald-700 font-mono font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Acknowledged
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incident Detail Modal */}
      <Modal
        isOpen={Boolean(selectedIncident)}
        onClose={() => setSelectedIncident(null)}
        title="Incident Telemetry Audit Record"
      >
        {selectedIncident && (
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-500">EVENT ID:</span>
                <span className="text-cyan-700 font-bold">{selectedIncident.id}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-500">TIMESTAMP:</span>
                <span className="text-slate-800">{formatDateTime(selectedIncident.timestamp)}</span>
              </div>
              <div className="flex justify-between items-center mb-1">
                <span className="text-slate-500">SOURCE SUBSYSTEM:</span>
                <span className="text-slate-800">
                  {selectedIncident.sensor === 'MQ-2'
                    ? 'Gas & Smoke Sensor'
                    : selectedIncident.sensor === 'MPU-6050'
                    ? 'Motion Sensor'
                    : selectedIncident.sensor === 'SOS_BUTTON'
                    ? 'Emergency SOS Button'
                    : 'Main Monitoring Device'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">SEVERITY CLASSIFICATION:</span>
                <Badge variant={selectedIncident.severity} size="xs">
                  {selectedIncident.severity}
                </Badge>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
              <span className="text-slate-500 block mb-1">AUDIT SUMMARY:</span>
              <p className="text-slate-900 font-sans text-sm leading-relaxed">
                {selectedIncident.message}
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
              <span className="text-slate-500 block mb-1">HARDWARE SNAPSHOT:</span>
              <div className="flex justify-between">
                <span>Device:</span>
                <span className="text-slate-700">Main Monitoring Device (ANVESHAK-ESP32-01)</span>
              </div>
              <div className="flex justify-between">
                <span>Network Node:</span>
                <span className="text-slate-700">192.168.1.142 (WiFi RSSI -58 dBm)</span>
              </div>
              <div className="flex justify-between">
                <span>Acknowledged State:</span>
                <span className={selectedIncident.acknowledged ? 'text-emerald-700 font-bold' : 'text-amber-700 font-bold'}>
                  {selectedIncident.acknowledged ? 'CONFIRMED BY OPERATOR' : 'PENDING REVIEW'}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {!selectedIncident.acknowledged && (
                <button
                  onClick={() => {
                    acknowledgeAlert(selectedIncident.id);
                    setSelectedIncident(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold font-sans shadow-sm"
                >
                  Acknowledge & Close
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

    </div>
  );
};
