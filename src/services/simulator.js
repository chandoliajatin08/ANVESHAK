/**
 * Realistic IoT Telemetry Simulator for ANVESHAK
 * Generates synthetic packets for ESP32, MQ-2, and MPU-6050
 */

export class TelemetrySimulator {
  constructor() {
    this.scenario = 'normal'; // 'normal' | 'smoke_spike' | 'fall_event' | 'shake_event' | 'sos_button' | 'offline'
    this.scenarioTicks = 0;
    this.uptimeSeconds = 3420;
    this.sosActive = false;

    // Baseline physics state
    this.state = {
      mq2: {
        rawAdc: 680,
        ppm: 110,
        voltage: 0.55,
        r0: 10.0,
        rsR0Ratio: 3.6,
      },
      mpu6050: {
        accel: { x: 0.04, y: -0.02, z: 0.98 },
        gyro: { x: 0.8, y: -0.4, z: 0.2 },
        tempC: 28.4,
        roll: -1,
        pitch: 2,
      },
      esp32: {
        isOnline: true,
        rssi: -58,
        freeHeap: 184512,
        ipAddress: '192.168.1.142',
        macAddress: 'C4:4F:33:8A:2B:10',
        chipTemp: 42.1,
        i2cHealth: true,
        mq2PinState: 'OK',
        oledState: 'OK',
      },
    };
  }

  setScenario(scenarioName) {
    this.scenario = scenarioName;
    this.scenarioTicks = 0;
    if (scenarioName === 'sos_button') {
      this.sosActive = true;
    }
  }

  resetScenario() {
    this.scenario = 'normal';
    this.scenarioTicks = 0;
    this.sosActive = false;
  }

  toggleSos(forceState) {
    this.sosActive = forceState !== undefined ? forceState : !this.sosActive;
    return this.sosActive;
  }

  // Generates next tick packet
  nextTick() {
    this.uptimeSeconds += 1;
    this.scenarioTicks += 1;

    // Check if device is offline
    if (this.scenario === 'offline') {
      return {
        timestamp: new Date().toISOString(),
        isSimulated: true,
        esp32: {
          ...this.state.esp32,
          isOnline: false,
          rssi: 0,
        },
        mq2: {
          rawAdc: null,
          ppm: null,
          voltage: null,
        },
        mpu6050: {
          accel: { x: null, y: null, z: null },
          gyro: { x: null, y: null, z: null },
          tempC: null,
          roll: null,
          pitch: null,
        },
        sosActive: false,
      };
    }

    // Natural random noise generator
    const noise = (amplitude) => (Math.random() - 0.5) * 2 * amplitude;

    let mq2Adc = this.state.mq2.rawAdc;
    let ax = this.state.mpu6050.accel.x;
    let ay = this.state.mpu6050.accel.y;
    let az = this.state.mpu6050.accel.z;
    let gx = this.state.mpu6050.gyro.x;
    let gy = this.state.mpu6050.gyro.y;
    let gz = this.state.mpu6050.gyro.z;
    let tempC = this.state.mpu6050.tempC;

    // Handle Scenarios
    if (this.scenario === 'smoke_spike') {
      // Simulate rising smoke and gradual dissipation after 12 ticks
      if (this.scenarioTicks < 15) {
        mq2Adc = Math.min(3650, 700 + this.scenarioTicks * 220 + noise(60));
      } else if (this.scenarioTicks < 30) {
        // High plateau
        mq2Adc = 3400 + noise(120);
      } else {
        // Clearing up
        mq2Adc = Math.max(720, 3400 - (this.scenarioTicks - 30) * 140 + noise(40));
        if (mq2Adc <= 750) this.scenario = 'normal';
      }
    } else if (this.scenario === 'fall_event') {
      // Freefall (ticks 1-2) -> Violent impact (ticks 3-5) -> Resting tilted (ticks 6-25)
      if (this.scenarioTicks <= 2) {
        ax = noise(0.1);
        ay = noise(0.1);
        az = 0.15 + noise(0.05); // near 0g freefall
        gx = noise(10);
        gy = noise(15);
        gz = noise(8);
      } else if (this.scenarioTicks <= 5) {
        ax = 1.9 + noise(0.4);
        ay = 2.4 + noise(0.5);
        az = -2.8 + noise(0.6); // severe impact > 3.8g shock
        gx = 240 + noise(50);
        gy = -180 + noise(40);
        gz = 160 + noise(30);
      } else if (this.scenarioTicks <= 25) {
        // Device resting sideways on floor
        ax = 0.88 + noise(0.02);
        ay = 0.42 + noise(0.02);
        az = 0.19 + noise(0.02);
        gx = noise(1.2);
        gy = noise(1.2);
        gz = noise(1.2);
      } else {
        this.scenario = 'normal';
      }
    } else if (this.scenario === 'shake_event') {
      if (this.scenarioTicks <= 15) {
        const t = this.scenarioTicks * 0.8;
        ax = Math.sin(t * 3) * 1.3 + noise(0.2);
        ay = Math.cos(t * 2.5) * 1.1 + noise(0.2);
        az = 1.0 + Math.sin(t * 4) * 0.9;
        gx = Math.cos(t * 3) * 120 + noise(20);
        gy = Math.sin(t * 2) * 110 + noise(20);
        gz = Math.sin(t * 3.5) * 90 + noise(15);
      } else {
        this.scenario = 'normal';
      }
    } else {
      // Normal nominal baseline
      mq2Adc = 680 + noise(25);
      ax = 0.02 + noise(0.03);
      ay = -0.01 + noise(0.03);
      az = 0.99 + noise(0.02);
      gx = noise(1.5);
      gy = noise(1.5);
      gz = noise(1.5);
    }

    // Temperature with slow ambient drift
    tempC = 28.2 + Math.sin(this.uptimeSeconds / 60) * 0.6 + noise(0.1);

    // Calculate Roll & Pitch
    const pitch = Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI);
    const roll = Math.atan2(-ax, az) * (180 / Math.PI);

    // Estimated MQ-2 PPM (exponential curve standard approximation)
    const voltage = (mq2Adc / 4095) * 3.3;
    const ppm = Math.max(10, Math.round(Math.pow(10, ((mq2Adc - 400) / 750) + 1.8)));

    const packet = {
      timestamp: new Date().toISOString(),
      isSimulated: true,
      simulationScenario: this.scenario,
      esp32: {
        isOnline: true,
        rssi: -58 + Math.round(noise(4)),
        freeHeap: 184512 + Math.round(noise(1024)),
        ipAddress: '192.168.1.142',
        macAddress: 'C4:4F:33:8A:2B:10',
        chipTemp: Number((41.5 + noise(0.4)).toFixed(1)),
        uptimeSeconds: this.uptimeSeconds,
        i2cHealth: true,
        mq2PinState: 'OK',
        oledState: 'OK',
      },
      mq2: {
        rawAdc: Math.round(Math.max(0, Math.min(4095, mq2Adc))),
        ppm: ppm,
        voltage: Number(voltage.toFixed(2)),
        rsR0Ratio: Number((4095 / (mq2Adc || 1) - 1).toFixed(2)),
      },
      mpu6050: {
        accel: {
          x: Number(ax.toFixed(2)),
          y: Number(ay.toFixed(2)),
          z: Number(az.toFixed(2)),
        },
        gyro: {
          x: Number(gx.toFixed(1)),
          y: Number(gy.toFixed(1)),
          z: Number(gz.toFixed(1)),
        },
        tempC: Number(tempC.toFixed(1)),
        roll: Math.round(roll),
        pitch: Math.round(pitch),
      },
      sosActive: this.sosActive,
    };

    return packet;
  }
}

export const simulator = new TelemetrySimulator();
