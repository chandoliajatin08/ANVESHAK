import React from 'react';
import { Activity, AlertOctagon, CheckCircle, Cpu, Radio, Wind, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '../common/Badge';

/**
 * AiRiskPanel
 * Shows the output of the backend AI risk engine (backend/ai-engine.js):
 * risk score with reasons, gas trend prediction, fall / SOS state and the helmet link.
 */

const LEVEL_STYLES = {
  LOW: { ring: 'border-emerald-300 bg-emerald-50 text-emerald-700', badge: 'clean' },
  MEDIUM: { ring: 'border-amber-300 bg-amber-50 text-amber-800', badge: 'warning' },
  HIGH: { ring: 'border-orange-400 bg-orange-50 text-orange-700', badge: 'danger' },
  CRITICAL: { ring: 'border-red-500 bg-red-50 text-red-700', badge: 'critical' },
};

const STATUS_BADGE = { NORMAL: 'clean', WARNING: 'warning', DANGER: 'critical', FALL: 'critical', SOS: 'critical' };

const formatDuration = (sec) => {
  if (sec === null || sec === undefined) return '—';
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
};

const Row = ({ label, children }) => (
  <div className="flex items-center justify-between gap-3 text-xs py-1 border-b border-slate-100 last:border-0">
    <span className="text-slate-500">{label}</span>
    <span className="font-mono font-semibold text-slate-900 text-right">{children}</span>
  </div>
);

const Card = ({ icon: Icon, title, subtitle, children }) => (
  <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col gap-3">
    <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200">
      <div className="p-2 rounded-xl bg-cyan-50 text-cyan-600 border border-cyan-200">
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        {subtitle && <div className="text-[11px] text-slate-500 font-mono">{subtitle}</div>}
      </div>
    </div>
    {children}
  </div>
);

export const AiRiskPanel = ({ packet }) => {
  const ai = packet?.ai;

  if (!packet) {
    return (
      <section className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
        <Cpu className="w-4 h-4 text-slate-400" />
        AI risk engine is waiting for the first packet from the helmet.
      </section>
    );
  }

  const level = ai?.riskLevel || 'LOW';
  const style = LEVEL_STYLES[level] || LEVEL_STYLES.LOW;
  const gas = ai?.gas;
  const lora = packet.lora || {};
  const sourceLabel =
    packet.source === 'lora' ? 'LoRa (wireless)' : packet.source === 'http' ? 'Wi-Fi HTTP' : packet.source?.startsWith('usb') ? 'USB cable' : packet.source || '—';

  const TrendIcon = gas?.trend === 'rising' ? TrendingUp : gas?.trend === 'falling' ? TrendingDown : Minus;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-black text-slate-900 tracking-tight flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-600" /> AI Risk Engine
        </h2>
        <span className="text-[11px] text-slate-500 font-mono">
          {ai?.engine || 'Waiting for AI output from backend'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Risk score */}
        <Card icon={AlertOctagon} title="Miner Risk Score" subtitle="0 = safe, 100 = needs help now">
          <div className="flex items-center gap-4">
            <div className={`w-24 h-24 rounded-full border-4 flex flex-col items-center justify-center ${style.ring}`}>
              <div className="text-3xl font-black leading-none">{ai ? ai.riskScore : '—'}</div>
              <div className="text-[10px] font-bold tracking-wide mt-1">{level}</div>
            </div>
            <div className="flex-1 space-y-1">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Why</div>
              <ul className="space-y-1">
                {(ai?.reasons || ['No AI output yet']).slice(0, 4).map((r) => (
                  <li key={r} className="text-xs text-slate-700 leading-snug">• {r}</li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        {/* 2. Gas prediction */}
        <Card icon={Wind} title="Gas Trend Prediction" subtitle={gas?.metric || 'Gas sensors'}>
          {gas ? (
            <div>
              <Row label="Current">{gas.value} {gas.unit}</Row>
              <Row label="Trend">
                <span className="inline-flex items-center gap-1">
                  <TrendIcon className="w-3.5 h-3.5" /> {gas.trend}
                  {gas.slopePerMin !== null && ` (${gas.slopePerMin > 0 ? '+' : ''}${gas.slopePerMin}/min)`}
                </span>
              </Row>
              <Row label="Danger in">
                {gas.timeToDangerSec !== null ? (
                  <span className={gas.timeToDangerSec <= 300 ? 'text-red-600' : ''}>~{formatDuration(gas.timeToDangerSec)}</span>
                ) : gas.value >= gas.dangerLevel ? (
                  <span className="text-red-600">ALREADY DANGEROUS</span>
                ) : (
                  'not predicted'
                )}
              </Row>
              <Row label="Sudden spike">{gas.spike ? <span className="text-red-600">YES (z={gas.zScore})</span> : 'no'}</Row>
              <Row label="Levels">warn {gas.warningLevel} / danger {gas.dangerLevel} {gas.unit}</Row>
              {gas.trend === 'learning' && (
                <div className="text-[11px] text-slate-500 mt-1">Collecting 15+ s of readings before predicting…</div>
              )}
            </div>
          ) : (
            <div className="text-xs text-slate-500">No gas data yet.</div>
          )}
        </Card>

        {/* 3. Fall + SOS */}
        <Card icon={Activity} title="Fall & SOS" subtitle="Detected on the helmet (works offline)">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={STATUS_BADGE[packet.status] || 'outline'} size="sm">
              HELMET: {packet.status || 'UNKNOWN'}
            </Badge>
            {packet.sosActive && <Badge variant="critical" size="sm">SOS ACTIVE</Badge>}
          </div>
          <div>
            <Row label="Fall detected">
              {packet.fallDetected ? <span className="text-red-600">YES</span> : 'no'}
            </Row>
            <Row label="AI fall confidence">
              {ai?.fall?.confidence !== null && ai?.fall?.confidence !== undefined
                ? `${Math.round(ai.fall.confidence * 100)}%`
                : ai?.fall?.lastImpactScore !== null && ai?.fall?.lastImpactScore !== undefined
                ? `last impact ${Math.round(ai.fall.lastImpactScore * 100)}%`
                : '—'}
            </Row>
            <Row label="No movement for">{formatDuration(ai?.stillSeconds)}</Row>
            <Row label="SOS button">{packet.sosActive ? <span className="text-red-600">PRESSED</span> : 'not pressed'}</Row>
          </div>
          <div className="text-[11px] text-slate-500">Hold the helmet button for 2 s to cancel SOS / fall.</div>
        </Card>

        {/* 4. Link */}
        <Card icon={Radio} title="Helmet Link" subtitle="How this packet arrived">
          <div>
            <Row label="Received via">{sourceLabel}</Row>
            <Row label="LoRa module">{lora.moduleReady ? 'ready' : 'not detected'}</Row>
            <Row label="LoRa RSSI">{lora.rssi !== null && lora.rssi !== undefined ? `${lora.rssi} dBm` : '—'}</Row>
            <Row label="LoRa SNR">{lora.snr !== null && lora.snr !== undefined ? `${lora.snr} dB` : '—'}</Row>
            <Row label="Packet loss">
              {lora.packetLossPct !== null && lora.packetLossPct !== undefined ? `${lora.packetLossPct}% (${lora.packetsReceived} rx)` : '—'}
            </Row>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            {lora.status ? <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> : <Radio className="w-3.5 h-3.5 text-slate-400" />}
            {lora.status ? 'Live over LoRa, no internet needed' : 'Not receiving over LoRa right now'}
          </div>
        </Card>
      </div>
    </section>
  );
};

export default AiRiskPanel;
