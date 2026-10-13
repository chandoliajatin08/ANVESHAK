/**
 * ============================================================================
 * ANVESHAK Telemetry Ingestion Microservice
 * Server-Side Firebase Admin SDK Ingestion Endpoint
 * Target RTDB: https://anveshak-live-monitor-default-rtdb.asia-southeast1.firebasedatabase.app
 * Target Node: /devices/ANVESHAK-ESP32-01/latest
 * ============================================================================
 */

import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const DEVICE_KEY = process.env.DEVICE_KEY || 'anveshak_sec_key_esp32_01';
const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ||
  'https://anveshak-live-monitor-default-rtdb.asia-southeast1.firebasedatabase.app';

import fs from 'fs';
import path from 'path';
import { SerialPort } from 'serialport';
import { ReadlineParser } from '@serialport/parser-readline';

// Initialize Firebase Admin SDK
// 1. Using serviceAccountKey.json if present in backend/
// 2. Or using FIREBASE_SERVICE_ACCOUNT_KEY environment variable (JSON string)
// 3. Or using Google Application Default Credentials
try {
  const localKeyPath = path.resolve('serviceAccountKey.json');
  if (fs.existsSync(localKeyPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(localKeyPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: DATABASE_URL,
    });
    console.log('[FIREBASE ADMIN] Initialized with local serviceAccountKey.json');
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: DATABASE_URL,
    });
    console.log('[FIREBASE ADMIN] Initialized with FIREBASE_SERVICE_ACCOUNT_KEY env');
  } else {
    // Falls back to Google Application Default Credentials or default app
    admin.initializeApp({
      databaseURL: DATABASE_URL,
    });
    console.log('[FIREBASE ADMIN] Initialized with default credentials/environment');
  }
  console.log('[FIREBASE ADMIN] Target RTDB:', DATABASE_URL);
} catch (e) {
  console.error('[FIREBASE ADMIN INIT ERROR]', e.message);
  console.info('Tip: Place your serviceAccountKey.json in the backend/ folder or set FIREBASE_SERVICE_ACCOUNT_KEY in .env');
}

app.use(cors());
app.use(express.json());

// Real-time In-Memory Telemetry State & SSE Client Registry (Real hardware packets only)
let latestTelemetryPacket = null;
const recentHistory = [];
const sseClients = new Set();
let lastHardwarePacketTimestamp = 0;

// Root Landing Endpoint
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>ANVESHAK Backend Service</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0b0f17; color: #f1f5f9; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #151d2c; border: 1px solid #1e293b; padding: 2.5rem; border-radius: 1rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 520px; text-align: center; }
        .badge { display: inline-block; background: #059669; color: white; padding: 0.25rem 0.75rem; border-radius: 9999px; font-size: 0.875rem; font-weight: 600; margin-bottom: 1rem; }
        h1 { margin: 0 0 0.5rem; font-size: 1.75rem; }
        p { color: #94a3b8; line-height: 1.5; margin-bottom: 1.5rem; }
        .btn { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; transition: background 0.2s; }
        .btn:hover { background: #1d4ed8; }
        .endpoints { margin-top: 1.5rem; text-align: left; background: #0f172a; padding: 1rem; border-radius: 0.5rem; font-size: 0.85rem; font-family: monospace; color: #38bdf8; }
      </style>
    </head>
    <body>
      <div class="card">
        <span class="badge">● Backend Online</span>
        <h1>ANVESHAK API Microservice</h1>
        <p>This is the backend ingestion service for ESP32 telemetry. To view the user interface dashboard, click the button below:</p>
        <a class="btn" href="http://localhost:5173" target="_self">Go to Frontend Dashboard (Port 5173)</a>
        <div class="endpoints">
          <div>GET  /health      - System Health Check</div>
          <div>GET  /api/stream  - Server-Sent Events (SSE) Live Feed</div>
          <div>GET  /api/latest  - Latest Hardware Packet</div>
          <div>POST /api/ingest  - Telemetry Ingestion API</div>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Health Check Endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    service: 'ANVESHAK Ingestion Service',
    databaseURL: DATABASE_URL,
    hasTelemetry: latestTelemetryPacket !== null,
    connectedClients: sseClients.size,
    timestamp: new Date().toISOString(),
  });
});

// Real-Time SSE Stream Endpoint for Web UI
app.get('/api/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  // Send current packet if available on connect
  if (latestTelemetryPacket) {
    res.write(`data: ${JSON.stringify(latestTelemetryPacket)}\n\n`);
  }

  sseClients.add(res);

  // Heartbeat comment ping every 15 seconds to prevent timeout
  const pingInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(pingInterval);
    sseClients.delete(res);
  });
});

// Latest Telemetry Snapshot Endpoint
app.get('/api/latest', (req, res) => {
  if (!latestTelemetryPacket) {
    return res.status(200).json({ status: 'waiting_for_data', message: 'No telemetry packets received yet from hardware.' });
  }
  res.json(latestTelemetryPacket);
});

// Historical Log Snapshot Endpoint
app.get('/api/history', (req, res) => {
  res.json(recentHistory);
});

/**
 * Shared Real-time Telemetry Ingestion Engine
 * Handles packets from either HTTP POST or USB Serial Bridge
 */
function processTelemetry(payload, sourceOverride = 'hardware') {
  if (!payload || typeof payload !== 'object') return null;

  const deviceId = payload.device || 'ANVESHAK-ESP32-01';
  const now = new Date().toISOString();

  const rawAdc = payload.mq2?.rawAdc !== undefined && payload.mq2?.rawAdc !== null && !isNaN(Number(payload.mq2.rawAdc))
    ? Number(payload.mq2.rawAdc)
    : (payload.gas_adc !== undefined ? Number(payload.gas_adc) : null);

  const ppm = payload.mq2?.ppm !== undefined && payload.mq2?.ppm !== null && !isNaN(Number(payload.mq2.ppm))
    ? Number(payload.mq2.ppm)
    : null;

  const voltage = payload.mq2?.voltage !== undefined && payload.mq2?.voltage !== null && !isNaN(Number(payload.mq2.voltage))
    ? Number(payload.mq2.voltage)
    : (rawAdc !== null ? Number(((rawAdc / 4095) * 3.3).toFixed(2)) : null);

  const ax = payload.mpu6050?.accel?.x !== undefined && payload.mpu6050?.accel?.x !== null && !isNaN(Number(payload.mpu6050.accel.x))
    ? Number(payload.mpu6050.accel.x)
    : (payload.ax !== undefined ? Number(payload.ax) : null);

  const ay = payload.mpu6050?.accel?.y !== undefined && payload.mpu6050?.accel?.y !== null && !isNaN(Number(payload.mpu6050.accel.y))
    ? Number(payload.mpu6050.accel.y)
    : (payload.ay !== undefined ? Number(payload.ay) : null);

  const az = payload.mpu6050?.accel?.z !== undefined && payload.mpu6050?.accel?.z !== null && !isNaN(Number(payload.mpu6050.accel.z))
    ? Number(payload.mpu6050.accel.z)
    : (payload.az !== undefined ? Number(payload.az) : null);

  const gx = payload.mpu6050?.gyro?.x !== undefined && payload.mpu6050?.gyro?.x !== null && !isNaN(Number(payload.mpu6050.gyro.x))
    ? Number(payload.mpu6050.gyro.x)
    : (payload.gx !== undefined ? Number(payload.gx) : null);

  const gy = payload.mpu6050?.gyro?.y !== undefined && payload.mpu6050?.gyro?.y !== null && !isNaN(Number(payload.mpu6050.gyro.y))
    ? Number(payload.mpu6050.gyro.y)
    : (payload.gy !== undefined ? Number(payload.gy) : null);

  const gz = payload.mpu6050?.gyro?.z !== undefined && payload.mpu6050?.gyro?.z !== null && !isNaN(Number(payload.mpu6050.gyro.z))
    ? Number(payload.mpu6050.gyro.z)
    : (payload.gz !== undefined ? Number(payload.gz) : null);

  const rawTemp = payload.mpu6050?.tempC ?? payload.temperature ?? payload.temp ?? payload.esp32?.chipTemp ?? null;
  const tempC = rawTemp !== null && rawTemp !== undefined && !isNaN(Number(rawTemp)) ? Number(rawTemp) : null;

  let roll = payload.mpu6050?.roll !== undefined && !isNaN(Number(payload.mpu6050.roll)) ? Number(payload.mpu6050.roll) : null;
  let pitch = payload.mpu6050?.pitch !== undefined && !isNaN(Number(payload.mpu6050.pitch)) ? Number(payload.mpu6050.pitch) : null;
  if (roll === null && ax !== null && az !== null) {
    roll = Math.round(Math.atan2(-ax, az) * (180 / Math.PI));
  }
  if (pitch === null && ay !== null && ax !== null && az !== null) {
    pitch = Math.round(Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI));
  }

  const isSimulated = Boolean(payload.isSimulated || payload.isTestPacket || payload.source === 'test-packet');
  const source = isSimulated ? 'test-packet' : (sourceOverride || payload.source || 'hardware');

  const sanitizedPacket = {
    timestamp: payload.timestamp || now,
    heartbeat: now,
    device: deviceId,
    seq: payload.seq !== undefined && payload.seq !== null ? Number(payload.seq) : null,
    isSimulated,
    source,
    esp32: {
      isOnline: payload.esp32?.isOnline !== false,
      rssi: payload.esp32?.rssi !== undefined ? Number(payload.esp32.rssi) : (payload.rssi !== undefined ? Number(payload.rssi) : null),
      freeHeap: payload.esp32?.freeHeap !== undefined ? Number(payload.esp32.freeHeap) : null,
      ipAddress: payload.esp32?.ipAddress ? String(payload.esp32.ipAddress) : (payload.ip ? String(payload.ip) : null),
      macAddress: payload.esp32?.macAddress ? String(payload.esp32.macAddress) : null,
      chipTemp: payload.esp32?.chipTemp !== undefined ? Number(payload.esp32.chipTemp) : null,
      uptimeSeconds: payload.esp32?.uptimeSeconds !== undefined ? Number(payload.esp32.uptimeSeconds) : (payload.uptime !== undefined ? Number(payload.uptime) : null),
    },
    mq2: {
      rawAdc,
      ppm,
      voltage,
    },
    mpu6050: {
      accel: { x: ax, y: ay, z: az },
      gyro: { x: gx, y: gy, z: gz },
      tempC,
      roll: roll !== null ? roll : 0,
      pitch: pitch !== null ? pitch : 0,
    },
    lora: {
      status: payload.lora?.status ?? payload.loraOK ?? true,
    },
    sosActive: Boolean(payload.sosActive || payload.alarmActive),
  };

  // 1. Store in Memory Cache
  if (!isSimulated) {
    lastHardwarePacketTimestamp = Date.now();
  }
  latestTelemetryPacket = sanitizedPacket;
  console.log(`[HARDWARE PACKET via ${source.toUpperCase()}] Device: ${deviceId} | MQ-2 ADC: ${rawAdc} | Gyro: (${gx}, ${gy}, ${gz}) | Temp: ${tempC}°C | LoRa: ${sanitizedPacket.lora.status ? 'OK' : 'ERR'}`);

  let gForce = null;
  if (ax !== null && ay !== null && az !== null) {
    gForce = Number(Math.sqrt(ax * ax + ay * ay + az * az).toFixed(2));
  }

  const historyEntry = {
    timestamp: sanitizedPacket.timestamp,
    gasAdc: rawAdc,
    ppm,
    tempC,
    gForce: gForce || 0,
    mq2: sanitizedPacket.mq2,
    mpu6050: {
      ...sanitizedPacket.mpu6050,
      gForce: gForce || 0,
    },
    sosActive: sanitizedPacket.sosActive,
  };
  recentHistory.push(historyEntry);
  if (recentHistory.length > 100) recentHistory.shift();

  // 2. Real-time broadcast to connected web UI clients (Zero Latency)
  const sseMsg = `data: ${JSON.stringify(sanitizedPacket)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(sseMsg);
    } catch {
      sseClients.delete(client);
    }
  }

  // 3. Asynchronous optional push to Firebase RTDB (Non-blocking)
  try {
    if (admin.apps.length > 0) {
      const db = admin.database();
      db.ref(`devices/${deviceId}/latest`).set(sanitizedPacket).catch((err) => {
        console.warn('[FIREBASE RTDB WRITE SKIPPED]', err.message);
      });
      db.ref(`devices/${deviceId}/history`).push(historyEntry).catch(() => {});
    }
  } catch (fbErr) {
    console.warn('[FIREBASE SKIP]', fbErr.message);
  }

  return sanitizedPacket;
}

/**
 * Secure Telemetry Ingestion Endpoint (Wi-Fi HTTP)
 * Header: X-Device-Key: <DEVICE_KEY> (Optional in local development)
 * Path: POST /api/ingest
 */
app.post('/api/ingest', async (req, res) => {
  const incomingKey = req.headers['x-device-key'];

  // 1. Device Authentication Check
  if (incomingKey && incomingKey !== DEVICE_KEY) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid X-Device-Key header.',
    });
  }

  const payload = req.body;
  if (!payload || typeof payload !== 'object') {
    return res.status(400).json({ error: 'Bad Request: Missing or invalid JSON body.' });
  }

  const sanitized = processTelemetry(payload, 'http');

  return res.status(200).json({
    success: true,
    message: 'Telemetry packet received and broadcast to UI',
    timestamp: sanitized.timestamp,
    device: sanitized.device,
    clientsBroadcasted: sseClients.size,
  });
});

// ============================================================================
// Auto-Reconnecting Direct USB Serial Port Ingestion (COM14 / Auto-Detect)
// Supports both Hardware Text Stream & JSON Telemetry Streams
// ============================================================================
let activeSerialPort = null;
let serialParser = null;

// Multi-line hardware telemetry state buffer
const serialPacketBuffer = {
  rawAdc: null,
  ax: null, ay: null, az: null,
  gx: null, gy: null, gz: null,
  tempC: null,
  lastUpdated: 0,
};

async function initSerialMonitor() {
  try {
    const ports = await SerialPort.list();
    const espPort = ports.find(p => p.path === 'COM14') ||
      ports.find(p => {
        const desc = `${p.manufacturer || ''} ${p.friendlyName || ''}`.toLowerCase();
        return desc.includes('cp210') || desc.includes('ch340') || desc.includes('silicon') || desc.includes('usb');
      });

    const targetPath = espPort ? espPort.path : (ports.length > 0 ? ports[0].path : 'COM14');

    if (activeSerialPort && activeSerialPort.isOpen) {
      return; // Already streaming
    }

    activeSerialPort = new SerialPort({
      path: targetPath,
      baudRate: 115200,
      autoOpen: false,
    });

    serialParser = activeSerialPort.pipe(new ReadlineParser({ delimiter: '\n' }));

    serialParser.on('data', (rawLine) => {
      const line = rawLine.toString().trim();
      if (!line) return;

      // -------------------------------------------------------------
      // Format 1: Text Telemetry Format (Current Hardware Output)
      // Example:
      // MQ2 ADC: 813
      // Accel(g): X=0.04 Y=0.04 Z=1.05
      // Gyro(deg/s): X=-5.1 Y=1.4 Z=1.1
      // MPU Temperature: 47.40 C
      // -------------------------------------------------------------
      const mqMatch = line.match(/MQ2\s*(?:ADC)?:?\s*(\d+)/i);
      if (mqMatch) {
        serialPacketBuffer.rawAdc = Number(mqMatch[1]);
        serialPacketBuffer.lastUpdated = Date.now();
      }

      const accelMatch = line.match(/Accel\(g\):\s*X=([-\d.]+)\s+Y=([-\d.]+)\s+Z=([-\d.]+)/i);
      if (accelMatch) {
        serialPacketBuffer.ax = Number(accelMatch[1]);
        serialPacketBuffer.ay = Number(accelMatch[2]);
        serialPacketBuffer.az = Number(accelMatch[3]);
        serialPacketBuffer.lastUpdated = Date.now();
      }

      const gyroMatch = line.match(/Gyro\(deg\/s\):\s*X=([-\d.]+)\s+Y=([-\d.]+)\s+Z=([-\d.]+)/i);
      if (gyroMatch) {
        serialPacketBuffer.gx = Number(gyroMatch[1]);
        serialPacketBuffer.gy = Number(gyroMatch[2]);
        serialPacketBuffer.gz = Number(gyroMatch[3]);
        serialPacketBuffer.lastUpdated = Date.now();
      }

      const tempMatch = line.match(/(?:MPU\s*)?Temperature:\s*([-\d.]+)/i);
      if (tempMatch) {
        serialPacketBuffer.tempC = Number(tempMatch[1]);
        serialPacketBuffer.lastUpdated = Date.now();

        // End of packet block: Dispatch telemetry to UI
        const rawAdc = serialPacketBuffer.rawAdc !== null ? serialPacketBuffer.rawAdc : 0;
        const ax = serialPacketBuffer.ax ?? 0;
        const ay = serialPacketBuffer.ay ?? 0;
        const az = serialPacketBuffer.az ?? 1.0;
        const gx = serialPacketBuffer.gx ?? 0;
        const gy = serialPacketBuffer.gy ?? 0;
        const gz = serialPacketBuffer.gz ?? 0;
        const tempC = serialPacketBuffer.tempC ?? 30.0;

        const roll = Math.round(Math.atan2(-ax, az) * (180 / Math.PI));
        const pitch = Math.round(Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI));

        processTelemetry({
          device: 'ANVESHAK-ESP32-01',
          source: 'usb-hardware',
          mq2: {
            rawAdc,
            voltage: Number(((rawAdc / 4095) * 3.3).toFixed(2)),
          },
          mpu6050: {
            accel: { x: ax, y: ay, z: az },
            gyro: { x: gx, y: gy, z: gz },
            tempC,
            roll,
            pitch,
          },
          esp32: {
            isOnline: true,
            ipAddress: 'USB-COM14',
            uptimeSeconds: Math.floor(process.uptime()),
          },
          lora: { status: false },
          alarmActive: rawAdc >= 1000,
          sosActive: rawAdc >= 1000,
        }, 'usb-hardware');
        return;
      }

      // -------------------------------------------------------------
      // Format 2: Tagged [ANVESHAK_DATA]{...}
      // -------------------------------------------------------------
      if (line.startsWith('[ANVESHAK_DATA]')) {
        try {
          const jsonStr = line.slice('[ANVESHAK_DATA]'.length).trim();
          const parsed = JSON.parse(jsonStr);
          processTelemetry(parsed, 'usb-serial');
        } catch {}
        return;
      }

      // -------------------------------------------------------------
      // Format 3: Raw JSON telemetry packet
      // -------------------------------------------------------------
      if (line.startsWith('{') && line.endsWith('}')) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.mq2 || parsed.mpu6050 || parsed.gas_adc) {
            processTelemetry(parsed, 'usb-serial');
          }
        } catch {}
      }
    });

    activeSerialPort.open((err) => {
      if (err) {
        activeSerialPort = null;
        setTimeout(initSerialMonitor, 3000);
      } else {
        console.log(`[USB SERIAL BRIDGE] Connected to ESP32 on ${targetPath} (115200 baud). Live telemetry active!`);
      }
    });

    activeSerialPort.on('error', (err) => {
      activeSerialPort = null;
      setTimeout(initSerialMonitor, 3000);
    });

    activeSerialPort.on('close', () => {
      activeSerialPort = null;
      setTimeout(initSerialMonitor, 3000);
    });
  } catch (err) {
    setTimeout(initSerialMonitor, 5000);
  }
}

app.listen(PORT, () => {
  console.log(`[ANVESHAK INGESTION SERVER] Running on port ${PORT}`);
  console.log(`[TARGET RTDB] ${DATABASE_URL}`);
  console.log(`[HTTP INGESTION] POST http://localhost:${PORT}/api/ingest`);
  initSerialMonitor();
});
