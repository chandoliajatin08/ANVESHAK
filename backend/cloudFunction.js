/**
 * ============================================================================
 * ANVESHAK Cloud Function Ingestion Endpoint (Serverless Alternative)
 * Target RTDB: https://anveshak-live-monitor-default-rtdb.asia-southeast1.firebasedatabase.app
 * Path: /devices/ANVESHAK-ESP32-01/latest
 * ============================================================================
 * 
 * Deployment:
 *   1. Initialize functions in your Firebase project: `firebase init functions`
 *   2. Paste this function into `functions/index.js`
 *   3. Set device key config: `firebase functions:config:set device.key="anveshak_sec_key_esp32_01"`
 *   4. Deploy: `firebase deploy --only functions:ingestTelemetry`
 *   5. Set the HTTPS trigger URL as INGESTION_URL in the ESP32 firmware.
 */

import functions from 'firebase-functions';
import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp();
}

export const ingestTelemetry = functions
  .region('asia-southeast1')
  .https.onRequest(async (req, res) => {
    // 1. Verify HTTP Method
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    }

    // 2. Authenticate Device via Pre-shared Key
    const configuredKey = process.env.DEVICE_KEY || 'anveshak_sec_key_esp32_01';
    const incomingKey = req.headers['x-device-key'];

    if (!incomingKey || incomingKey !== configuredKey) {
      return res.status(401).json({
        error: 'Unauthorized: Invalid or missing X-Device-Key header.',
      });
    }

    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Bad Request: Missing or invalid JSON body.' });
    }

    const deviceId = payload.device || 'ANVESHAK-ESP32-01';
    const now = new Date().toISOString();

    // 3. Truthfully Parse Telemetry (Never fabricate readings)
    const rawAdc = payload.mq2?.rawAdc !== undefined && payload.mq2?.rawAdc !== null && !isNaN(Number(payload.mq2.rawAdc))
      ? Number(payload.mq2.rawAdc) : null;
    const ppm = payload.mq2?.ppm !== undefined && payload.mq2?.ppm !== null && !isNaN(Number(payload.mq2.ppm))
      ? Number(payload.mq2.ppm) : null;
    const voltage = payload.mq2?.voltage !== undefined && payload.mq2?.voltage !== null && !isNaN(Number(payload.mq2.voltage))
      ? Number(payload.mq2.voltage)
      : (rawAdc !== null ? Number(((rawAdc / 4095) * 3.3).toFixed(2)) : null);

    const ax = payload.mpu6050?.accel?.x !== undefined && payload.mpu6050?.accel?.x !== null && !isNaN(Number(payload.mpu6050.accel.x))
      ? Number(payload.mpu6050.accel.x) : null;
    const ay = payload.mpu6050?.accel?.y !== undefined && payload.mpu6050?.accel?.y !== null && !isNaN(Number(payload.mpu6050.accel.y))
      ? Number(payload.mpu6050.accel.y) : null;
    const az = payload.mpu6050?.accel?.z !== undefined && payload.mpu6050?.accel?.z !== null && !isNaN(Number(payload.mpu6050.accel.z))
      ? Number(payload.mpu6050.accel.z) : null;

    const gx = payload.mpu6050?.gyro?.x !== undefined && payload.mpu6050?.gyro?.x !== null && !isNaN(Number(payload.mpu6050.gyro.x))
      ? Number(payload.mpu6050.gyro.x) : null;
    const gy = payload.mpu6050?.gyro?.y !== undefined && payload.mpu6050?.gyro?.y !== null && !isNaN(Number(payload.mpu6050.gyro.y))
      ? Number(payload.mpu6050.gyro.y) : null;
    const gz = payload.mpu6050?.gyro?.z !== undefined && payload.mpu6050?.gyro?.z !== null && !isNaN(Number(payload.mpu6050.gyro.z))
      ? Number(payload.mpu6050.gyro.z) : null;

    const rawTemp = payload.mpu6050?.tempC ?? payload.esp32?.chipTemp ?? null;
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
    const source = isSimulated ? 'test-packet' : (payload.source || 'hardware');

    const sanitizedPacket = {
      timestamp: payload.timestamp || now,
      heartbeat: now,
      device: deviceId,
      seq: payload.seq !== undefined && payload.seq !== null ? Number(payload.seq) : null,
      isSimulated,
      source,
      esp32: {
        isOnline: payload.esp32?.isOnline !== false,
        rssi: payload.esp32?.rssi !== undefined ? Number(payload.esp32.rssi) : null,
        freeHeap: payload.esp32?.freeHeap !== undefined ? Number(payload.esp32.freeHeap) : null,
        ipAddress: payload.esp32?.ipAddress ? String(payload.esp32.ipAddress) : null,
        macAddress: payload.esp32?.macAddress ? String(payload.esp32.macAddress) : null,
        chipTemp: payload.esp32?.chipTemp !== undefined ? Number(payload.esp32.chipTemp) : null,
        uptimeSeconds: payload.esp32?.uptimeSeconds !== undefined ? Number(payload.esp32.uptimeSeconds) : null,
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
      sosActive: Boolean(payload.sosActive),
    };

    try {
      const db = admin.database();

      // 4. Update /latest
      await db.ref(`devices/${deviceId}/latest`).set(sanitizedPacket);

      // 5. Append to /history with full normalization
      let gForce = null;
      if (ax !== null && ay !== null && az !== null) {
        gForce = Number(Math.sqrt(ax * ax + ay * ay + az * az).toFixed(2));
      }

      await db.ref(`devices/${deviceId}/history`).push({
        timestamp: sanitizedPacket.timestamp,
        gasAdc: rawAdc,
        ppm,
        tempC,
        gForce: gForce || 0,
        mq2: sanitizedPacket.mq2,
        mpu6050: sanitizedPacket.mpu6050,
        sosActive: sanitizedPacket.sosActive,
      });

      // 6. Push real alert if critical conditions met
      if (sanitizedPacket.sosActive) {
        await db.ref(`devices/${deviceId}/alerts`).push({
          type: 'SOS_EVENT',
          title: 'EMERGENCY SOS TRIGGERED',
          message: 'Physical SOS emergency trigger engaged on ESP32 device.',
          timestamp: now,
          severity: 'critical',
          acknowledged: false,
          sensor: 'SOS_BUTTON',
        });
      } else if (rawAdc !== null && rawAdc >= 2400) {
        await db.ref(`devices/${deviceId}/alerts`).push({
          type: 'GAS_CRITICAL',
          title: 'DANGEROUS GAS / SMOKE LEAK',
          message: `MQ-2 sensor exceeded critical threshold: ${rawAdc} ADC.`,
          timestamp: now,
          severity: 'critical',
          acknowledged: false,
          sensor: 'MQ-2',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Telemetry successfully ingested via Cloud Function',
        target: `/devices/${deviceId}/latest`,
        timestamp: now,
      });
    } catch (err) {
      console.error('[CLOUD FUNCTION DB ERROR]', err);
      return res.status(500).json({ error: 'Database dispatch error: ' + err.message });
    }
  });
