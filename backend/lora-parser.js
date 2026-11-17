/**
 * Parses a line from the LoRa gateway:
 *   [ANVESHAK_LORA]ANV,device,seq,status,sos,fall,mq2Adc,mq2Ppm,mq4Adc,mq4Ppm,
 *                  ax,ay,az,gx,gy,gz,devTemp,roll,pitch,impactId,peakG,minG,peakGyro,tilt,still|RSSI|SNR
 * and returns a payload in the same shape as the helmet's USB JSON packet.
 */
export const LORA_PREFIX = '[ANVESHAK_LORA]';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const ppmOrNull = (v) => {
  const n = num(v);
  return n === null || n < 0 ? null : n;
};

export function parseLoraLine(line) {
  if (!line.startsWith(LORA_PREFIX)) return null;
  const [csv, rssi, snr] = line.slice(LORA_PREFIX.length).split('|');
  const f = (csv || '').split(',');
  if (f[0] !== 'ANV' || f.length < 25) return null;

  return {
    device: f[1],
    seq: num(f[2]),
    status: f[3],
    sosActive: f[4] === '1',
    fallDetected: f[5] === '1',
    mq2: { rawAdc: num(f[6]), ppm: ppmOrNull(f[7]) },
    mq4: { rawAdc: num(f[8]), ppm: ppmOrNull(f[9]), enabled: true },
    mpu6050: {
      accel: { x: num(f[10]), y: num(f[11]), z: num(f[12]) },
      gyro: { x: num(f[13]), y: num(f[14]), z: num(f[15]) },
      tempC: num(f[16]),
      roll: num(f[17]),
      pitch: num(f[18]),
    },
    fallEvent: {
      id: num(f[19]),
      peakG: num(f[20]),
      minG: num(f[21]),
      peakGyro: num(f[22]),
      tiltDeg: num(f[23]),
      stillRatio: num(f[24]),
    },
    alarmActive: f[3] === 'DANGER',
    gasLevel: f[3] === 'DANGER' ? 2 : f[3] === 'WARNING' ? 1 : f[3] === 'NORMAL' ? 0 : null,
    lora: { moduleReady: true, rssi: num(rssi), snr: num(snr) },
  };
}
