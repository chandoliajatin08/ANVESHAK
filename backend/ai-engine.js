/**
 * ============================================================================
 * ANVESHAK AI Risk Engine
 * ============================================================================
 * Runs on the laptop for every packet from the helmet. Three parts:
 *
 *  1. Gas trend prediction  - fits a straight line (linear regression) to the
 *     last 60 s of gas readings and predicts the time until the danger level.
 *  2. Gas anomaly detection - flags sudden spikes far above the recent average
 *     (z-score), even before the danger threshold is reached.
 *  3. Miner risk score      - an explainable 0-100 score that combines gas level,
 *     gas trend, fall, stillness and SOS, so rescue teams know who to reach first.
 *
 * Fall detection itself runs on the helmet (fail-safe). Here we score how
 * confident we are that a reported impact is a real fall, using the impact
 * features the helmet sends (peak g, free-fall minimum, tilt, stillness).
 * A trained ML classifier for falls is planned (see README).
 * ============================================================================
 */

const WINDOW_MS = 60_000;          // gas history used for prediction
const MIN_POINTS = 8;              // need at least this many readings
const MIN_SPAN_MS = 15_000;        // and at least 15 s of history
const PREDICT_WARN_SEC = 300;      // warn if danger is predicted within 5 min

const deviceState = new Map();

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? null : Number(v.toFixed(d)));

function getState(deviceId) {
  if (!deviceState.has(deviceId)) {
    deviceState.set(deviceId, { gas: [], lastMoveAt: Date.now(), lastFallEventId: null, lastFallScore: null });
  }
  return deviceState.get(deviceId);
}

/**
 * Pick the most meaningful gas value available, with matching thresholds.
 * Priority: calibrated methane ppm (MQ-4) > calibrated MQ-2 ppm > raw ADC (worst of both).
 */
function selectGasMetric(packet) {
  const mq4 = packet.mq4 || {};
  const mq2 = packet.mq2 || {};
  if (mq4.ppm !== null && mq4.ppm !== undefined && mq4.ppm >= 0) {
    return { name: 'Methane (MQ-4)', unit: 'ppm', value: mq4.ppm, warning: 1000, danger: 5000 };
  }
  if (mq2.ppm !== null && mq2.ppm !== undefined && mq2.ppm >= 0) {
    return { name: 'Combustible gas (MQ-2)', unit: 'ppm', value: mq2.ppm, warning: 300, danger: 1000 };
  }
  const raw = Math.max(mq2.rawAdc ?? 0, mq4.rawAdc ?? 0);
  if (mq2.rawAdc === null && mq4.rawAdc === null) return null;
  return { name: 'Gas (raw ADC, uncalibrated)', unit: 'ADC', value: raw, warning: 800, danger: 1000 };
}

/** Least-squares slope (units per second) of value over time. */
function linearSlope(points) {
  const n = points.length;
  const t0 = points[0].t;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of points) {
    const x = (p.t - t0) / 1000;
    sx += x; sy += p.v; sxx += x * x; sxy += x * p.v;
  }
  const denom = n * sxx - sx * sx;
  if (denom === 0) return 0;
  return (n * sxy - sx * sy) / denom;
}

function analyseGas(state, metric, now) {
  if (!metric) return null;
  state.gas.push({ t: now, v: metric.value });
  while (state.gas.length && now - state.gas[0].t > WINDOW_MS) state.gas.shift();

  const pts = state.gas;
  const span = pts.length ? now - pts[0].t : 0;
  const result = {
    metric: metric.name,
    unit: metric.unit,
    value: round(metric.value, 0),
    warningLevel: metric.warning,
    dangerLevel: metric.danger,
    slopePerMin: null,
    trend: 'learning',
    timeToDangerSec: null,
    dangerSoon: false,
    spike: false,
    zScore: null,
    samples: pts.length,
  };
  if (pts.length < MIN_POINTS || span < MIN_SPAN_MS) return result;

  const slopePerSec = linearSlope(pts);
  result.slopePerMin = round(slopePerSec * 60, 1);

  // "Stable" if the change over one minute is small compared with the danger level
  const relChangePerMin = Math.abs(slopePerSec * 60) / metric.danger;
  result.trend = relChangePerMin < 0.03 ? 'stable' : slopePerSec > 0 ? 'rising' : 'falling';

  if (slopePerSec > 0 && metric.value < metric.danger && result.trend === 'rising') {
    result.timeToDangerSec = Math.round((metric.danger - metric.value) / slopePerSec);
  }
  result.dangerSoon = result.timeToDangerSec !== null && result.timeToDangerSec <= PREDICT_WARN_SEC;

  // Spike: latest value far above the mean of the earlier readings
  const earlier = pts.slice(0, -1).map((p) => p.v);
  const mean = earlier.reduce((a, b) => a + b, 0) / earlier.length;
  const rawSd = Math.sqrt(earlier.reduce((a, b) => a + (b - mean) ** 2, 0) / earlier.length);
  const sd = Math.max(rawSd, metric.danger * 0.01);   // floor so tiny sensor noise does not create huge z-scores
  if (sd > 0) {
    const z = (metric.value - mean) / sd;
    result.zScore = round(z, 2);
    result.spike = z > 3 && metric.value > mean * 1.2;
  }
  return result;
}

/** Confidence (0-1) that an impact was a real fall, from the helmet's impact features. */
function scoreFall(ev) {
  if (!ev || !ev.id) return null;
  const impact = clamp((ev.peakG - 2.0) / 2.0, 0, 1);       // 2 g -> 0, 4 g -> 1
  const freeFall = clamp((0.8 - ev.minG) / 0.6, 0, 1);      // 0.8 g -> 0, 0.2 g -> 1
  const tilt = clamp((ev.tiltDeg - 30) / 60, 0, 1);         // 30 deg -> 0, 90 deg -> 1
  const still = clamp((ev.stillRatio - 0.4) / 0.6, 0, 1);   // 40% -> 0, 100% -> 1
  return round(0.3 * impact + 0.15 * freeFall + 0.3 * tilt + 0.25 * still, 2);
}

/**
 * Main entry: analyse one sanitized packet and return the AI block.
 */
export function analysePacket(packet) {
  const now = Date.now();
  const state = getState(packet.device || 'unknown');

  // Movement / stillness tracking (from the latest accel + gyro sample)
  const a = packet.mpu6050?.accel || {};
  const g = packet.mpu6050?.gyro || {};
  if (a.x !== null && a.x !== undefined) {
    const mag = Math.sqrt(a.x ** 2 + a.y ** 2 + a.z ** 2);
    const gyro = Math.sqrt((g.x ?? 0) ** 2 + (g.y ?? 0) ** 2 + (g.z ?? 0) ** 2);
    if (Math.abs(mag - 1) > 0.12 || gyro > 25) state.lastMoveAt = now;
  }
  const stillSeconds = Math.round((now - state.lastMoveAt) / 1000);

  const gas = analyseGas(state, selectGasMetric(packet), now);

  // Fall confidence: re-score only when the helmet reports a new impact event
  const ev = packet.fallEvent;
  if (ev && ev.id && ev.id !== state.lastFallEventId) {
    state.lastFallEventId = ev.id;
    state.lastFallScore = scoreFall(ev);
  }
  const fall = {
    detected: Boolean(packet.fallDetected),
    confidence: packet.fallDetected ? state.lastFallScore : null,
    lastImpactScore: state.lastFallScore,
  };

  // ----- Explainable risk score (0-100) -----
  const reasons = [];
  let score = 0;

  if (gas) {
    const gasPts = Math.round(clamp(gas.value / gas.dangerLevel, 0, 1) * 40);
    if (gasPts > 0) { score += gasPts; reasons.push(`Gas at ${Math.round((gas.value / gas.dangerLevel) * 100)}% of danger level (+${gasPts})`); }

    let trendPts = 0;
    if (gas.timeToDangerSec !== null) {
      trendPts = gas.timeToDangerSec < 120 ? 15 : gas.timeToDangerSec < 300 ? 10 : 5;
      reasons.push(`Gas rising, danger predicted in ~${Math.max(1, Math.round(gas.timeToDangerSec / 60))} min (+${trendPts})`);
    }
    if (gas.spike) { trendPts = Math.min(15, trendPts + 5); reasons.push('Sudden gas spike detected (+5)'); }
    score += trendPts;
  }

  if (fall.detected) { score += 30; reasons.push('Fall detected by helmet (+30)'); }
  if (fall.detected && stillSeconds > 10) { score += 20; reasons.push(`No movement for ${stillSeconds}s after fall (+20)`); }
  else if (!fall.detected && stillSeconds > 120) { score += 10; reasons.push(`No movement for ${stillSeconds}s (+10)`); }

  if (packet.sosActive) { score = 100; reasons.unshift('SOS pressed by miner (score set to 100)'); }
  score = clamp(Math.round(score), 0, 100);

  const level = score >= 80 ? 'CRITICAL' : score >= 60 ? 'HIGH' : score >= 30 ? 'MEDIUM' : 'LOW';
  if (reasons.length === 0) reasons.push('All readings normal');

  return {
    riskScore: score,
    riskLevel: level,
    reasons,
    gas,
    fall,
    stillSeconds,
    engine: 'ANVESHAK risk engine v1 (regression + anomaly detection + explainable scoring)',
  };
}

export function resetAiState() {
  deviceState.clear();
}
