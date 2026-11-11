import React, { useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cpu,
  Gauge,
  Radio,
  ShieldCheck,
  Thermometer,
  Wind,
  Zap,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } from 'recharts';
import { useTelemetry } from '../context/TelemetryContext';
import { Badge } from '../components/common/Badge';
import {
  calculateGForce,
  formatTimestamp,
  getGasStatus,
  getMotionStatus,
} from '../utils/formatters';

const statusStyles = {
  clean: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  critical: 'text-red-700 bg-red-50 border-red-200',
  info: 'text-sky-700 bg-sky-50 border-sky-200',
};

function Metric({ icon: Icon, label, value, detail, tone = 'clean' }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Icon className="h-4 w-4 text-slate-400" />
          {label}
        </div>
        <span className={`h-2 w-2 rounded-full ${tone === 'critical' ? 'bg-red-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
      </div>
      <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{detail}</div>
    </article>
  );
}

function SensorCard({ title, eyebrow, icon: Icon, status, value, unit, children }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-100 p-2 text-slate-600"><Icon className="h-4 w-4" /></div>
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-400">{eyebrow}</div>
          </div>
        </div>
        <Badge variant={status.level} size="sm">{status.label}</Badge>
      </div>
      <div className="mt-6 flex items-end gap-2">
        <span className="text-4xl font-semibold tracking-tight text-slate-950">{value}</span>
        <span className="mb-1 text-sm text-slate-400">{unit}</span>
      </div>
      {children}
    </article>
  );
}

export const LiveSensors = () => {
  const { latestPacket, historyBuffer, thresholds, alerts, liveEmpty, deviceStatus, acknowledgeAlert } = useTelemetry();
  const mq2 = latestPacket?.mq2;
  const mpu = latestPacket?.mpu6050;
  const gasStatus = getGasStatus(mq2?.rawAdc, { warning: thresholds.gasWarning, critical: thresholds.gasCritical });
  const gForce = calculateGForce(mpu?.accel?.x || 0, mpu?.accel?.y || 0, mpu?.accel?.z || 1);
  const motionStatus = getMotionStatus(gForce, mpu?.roll || 0, mpu?.pitch || 0);
  const temp = typeof mpu?.tempC === 'number' ? mpu.tempC : null;
  const activeAlerts = alerts.filter((alert) => !alert.acknowledged).slice(0, 3);
  const chartData = historyBuffer.map((item) => ({
    time: formatTimestamp(item.timestamp),
    gas: item.mq2?.rawAdc ?? 0,
    motion: calculateGForce(item.mpu6050?.accel?.x || 0, item.mpu6050?.accel?.y || 0, item.mpu6050?.accel?.z || 1),
  }));
  const systemTone = latestPacket?.sosActive || gasStatus.level === 'critical' || motionStatus.level === 'critical' ? 'critical' : activeAlerts.length ? 'warning' : 'clean';
  const algorithmResult = useMemo(() => {
    if (latestPacket?.sosActive) return { name: 'Emergency event classifier', text: 'SOS signal detected from hardware input.', tone: 'critical' };
    if (gasStatus.level === 'critical' || motionStatus.level === 'critical') return { name: 'Multi-sensor anomaly detector', text: 'Critical threshold crossed. Immediate review recommended.', tone: 'critical' };
    if (gasStatus.level === 'warning' || motionStatus.level === 'warning' || (temp !== null && temp >= thresholds.overheatTemp)) return { name: 'Threshold + anomaly detector', text: 'A warning pattern was detected across the sensor stream.', tone: 'warning' };
    return { name: 'Threshold + anomaly detector', text: 'No abnormal pattern detected in the latest reading.', tone: 'clean' };
  }, [gasStatus.level, latestPacket?.sosActive, motionStatus.level, temp, thresholds.overheatTemp]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-slate-400"><span className="h-2 w-2 rounded-full bg-cyan-500" /> Anveshak / Monitoring</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Safety dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">A live view of your connected worker-safety device.</p>
        </div>
        <div className={`flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${statusStyles[systemTone]}`}>
          <span className="h-2 w-2 rounded-full bg-current" />
          System {systemTone === 'clean' ? 'operational' : systemTone === 'warning' ? 'needs attention' : 'in critical state'}
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric icon={Radio} label="Device connection" value={deviceStatus?.status === 'Device Online' ? 'Online' : 'Waiting'} detail={latestPacket?.device || 'ANVESHAK-ESP32-01'} tone={deviceStatus?.level} />
        <Metric icon={Wind} label="Gas level" value={mq2?.rawAdc ?? '—'} detail={`Warning at ${thresholds.gasWarning} ADC`} tone={gasStatus.level} />
        <Metric icon={Activity} label="Motion" value={mpu ? `${gForce.toFixed(2)} g` : '—'} detail={mpu ? `Roll ${mpu.roll}° · Pitch ${mpu.pitch}°` : 'Awaiting sensor data'} tone={motionStatus.level} />
        <Metric icon={Thermometer} label="Temperature" value={temp !== null ? `${temp.toFixed(1)}°` : '—'} detail={temp !== null ? 'Onboard sensor' : 'No reading available'} tone={temp !== null && temp >= thresholds.overheatTemp ? 'warning' : 'clean'} />
      </section>

      {liveEmpty && <div className="flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800"><Radio className="h-4 w-4 shrink-0" /><span>Waiting for the first hardware telemetry packet.</span></div>}

      <section className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-semibold text-slate-900">Telemetry trend</h2><p className="mt-1 text-xs text-slate-500">Recent gas and motion readings</p></div><span className="text-xs text-slate-400">Last 30 samples</span></div>
          <div className="mt-5 h-56">
            {chartData.length ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="gasFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0891b2" stopOpacity={0.22} /><stop offset="100%" stopColor="#0891b2" stopOpacity={0} /></linearGradient></defs><XAxis dataKey="time" hide /><Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} /><Area type="monotone" dataKey="gas" stroke="#0891b2" fill="url(#gasFill)" strokeWidth={2} name="Gas ADC" /><Area type="monotone" dataKey="motion" stroke="#64748b" fill="none" strokeWidth={1.5} name="Motion (g)" /></AreaChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-400">Telemetry will appear here once data arrives.</div>}
          </div>
          <div className="mt-4 flex gap-5 text-xs text-slate-500"><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-cyan-600" /> Gas ADC</span><span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full bg-slate-500" /> Motion</span></div>
        </article>
        <article className={`rounded-xl border p-5 ${statusStyles[algorithmResult.tone]}`}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]"><Gauge className="h-4 w-4" /> Detection result</div>
          <h2 className="mt-6 text-xl font-semibold">{algorithmResult.name}</h2>
          <p className="mt-2 text-sm leading-6 opacity-80">{algorithmResult.text}</p>
          <div className="mt-8 border-t border-current/10 pt-4 text-xs"><div className="flex justify-between"><span className="opacity-70">Signals evaluated</span><strong>Gas · Motion · Temp · SOS</strong></div><div className="mt-3 flex justify-between"><span className="opacity-70">Decision mode</span><strong>Live thresholds</strong></div></div>
        </article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <SensorCard title="Gas & smoke" eyebrow="MQ-2 analog detector" icon={Wind} status={gasStatus} value={mq2?.rawAdc ?? '—'} unit="ADC"><div className="mt-5"><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${gasStatus.level === 'critical' ? 'bg-red-500' : gasStatus.level === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, ((mq2?.rawAdc || 0) / 4095) * 100)}%` }} /></div><div className="mt-2 flex justify-between text-[11px] text-slate-400"><span>0</span><span>Critical: {thresholds.gasCritical}</span></div></div></SensorCard>
        <SensorCard title="Motion & impact" eyebrow="MPU-6050 IMU" icon={Activity} status={motionStatus} value={mpu ? gForce.toFixed(2) : '—'} unit="g"><div className="mt-5 grid grid-cols-2 gap-2 text-xs"><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-400">Roll</span><strong className="mt-1 block text-slate-800">{mpu?.roll ?? '—'}°</strong></div><div className="rounded-lg bg-slate-50 p-2"><span className="text-slate-400">Pitch</span><strong className="mt-1 block text-slate-800">{mpu?.pitch ?? '—'}°</strong></div></div></SensorCard>
        <SensorCard title="Device health" eyebrow="ESP32 telemetry" icon={Cpu} status={{ level: deviceStatus?.level || 'info', label: deviceStatus?.status || 'Unknown' }} value={latestPacket?.esp32?.rssi ?? '—'} unit={latestPacket?.esp32?.rssi ? 'dBm' : ''}><div className="mt-5 flex items-center gap-2 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-500" /> Secure telemetry channel active</div></SensorCard>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,.04)]"><div className="flex items-center justify-between"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h2 className="text-sm font-semibold text-slate-900">Warnings & alerts</h2></div><span className="text-xs text-slate-400">{activeAlerts.length} active</span></div>{activeAlerts.length ? <div className="mt-4 space-y-2">{activeAlerts.map((alert) => <div key={alert.id} className={`flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between ${alert.severity === 'critical' ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}`}><div><div className="text-sm font-medium text-slate-900">{alert.title}</div><div className="mt-1 text-xs text-slate-500">{alert.message}</div></div><button onClick={() => acknowledgeAlert(alert.id)} className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">Acknowledge</button></div>)}</div> : <div className="mt-4 flex items-center gap-3 rounded-lg bg-emerald-50 px-3 py-3 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" /> No active warnings. All monitored signals are within limits.</div>}</section>
      <div className="flex items-center gap-2 pb-2 text-xs text-slate-400"><Zap className="h-3.5 w-3.5" /> Last update {latestPacket?.timestamp ? formatTimestamp(latestPacket.timestamp) : 'not received yet'}</div>
    </div>
  );
};
