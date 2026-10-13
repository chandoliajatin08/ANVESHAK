/**
 * Pre-generated and dynamic historical telemetry datasets for date filtering
 */

export const generateHistoricalLogs = (startDate, endDate, count = 120) => {
  const start = new Date(startDate).getTime();
  const end = new Date(endDate).getTime();
  const step = Math.max(1000, (end - start) / count);

  const logs = [];

  for (let i = 0; i < count; i++) {
    const timestamp = new Date(start + i * step).toISOString();
    
    // Inject periodic gas rises and motion vibrations
    const hourFactor = Math.sin((i / count) * Math.PI * 4);
    const gasBase = 650 + (hourFactor > 0.6 ? 750 * hourFactor : 0);
    const mq2Adc = Math.round(gasBase + (Math.random() - 0.5) * 80);
    const ppm = Math.max(15, Math.round(Math.pow(10, ((mq2Adc - 400) / 750) + 1.8)));

    // Occasional motion events
    const isSpike = i % 29 === 0;
    const ax = Number((0.02 + (isSpike ? 1.85 : 0) + (Math.random() - 0.5) * 0.1).toFixed(2));
    const ay = Number((-0.01 + (isSpike ? 1.45 : 0) + (Math.random() - 0.5) * 0.1).toFixed(2));
    const az = Number((0.98 + (isSpike ? -1.1 : 0) + (Math.random() - 0.5) * 0.1).toFixed(2));

    const gx = Number((0.5 + (isSpike ? 85.0 : 0) + (Math.random() - 0.5) * 3).toFixed(1));
    const gy = Number((-0.2 + (isSpike ? -60.0 : 0) + (Math.random() - 0.5) * 3).toFixed(1));
    const gz = Number((0.1 + (isSpike ? 40.0 : 0) + (Math.random() - 0.5) * 2).toFixed(1));

    const tempC = Number((28.0 + Math.sin(i / 15) * 1.5 + (Math.random() - 0.5) * 0.3).toFixed(1));

    const gForce = Number(Math.sqrt(ax * ax + ay * ay + az * az).toFixed(2));

    let alert = null;
    if (mq2Adc > 2200) {
      alert = { type: 'GAS_CRITICAL', message: `Critical gas spike detected: ${mq2Adc} ADC (${ppm} ppm)` };
    } else if (mq2Adc > 1200) {
      alert = { type: 'GAS_WARNING', message: `Elevated gas level: ${mq2Adc} ADC` };
    } else if (gForce > 2.4) {
      alert = { type: 'FALL_IMPACT', message: `High shock impact registered: ${gForce} g` };
    }

    logs.push({
      id: `hist_${i}_${Date.now()}`,
      timestamp,
      mq2: {
        rawAdc: mq2Adc,
        ppm,
        voltage: Number(((mq2Adc / 4095) * 3.3).toFixed(2)),
      },
      mpu6050: {
        accel: { x: ax, y: ay, z: az },
        gyro: { x: gx, y: gy, z: gz },
        gForce,
        tempC,
      },
      alert,
    });
  }

  return logs;
};
