/**
 * Quick test of the AI engine and LoRa parser without any hardware.
 * Run:  npm run test:ai
 */
import { analysePacket, resetAiState } from './ai-engine.js';
import { parseLoraLine } from './lora-parser.js';

const realNow = Date.now;
let fakeTime = realNow();
Date.now = () => fakeTime;

const packet = (adc, extra = {}) => ({
  device: 'TEST-HELMET',
  mq2: { rawAdc: adc, ppm: null },
  mq4: { rawAdc: 300, ppm: null },
  mpu6050: { accel: { x: 0, y: 0, z: 1 }, gyro: { x: 0, y: 0, z: 0 } },
  sosActive: false,
  fallDetected: false,
  ...extra,
});

console.log('1) Gas rising slowly (raw ADC 500 -> 740 over 60 s):');
resetAiState();
let ai;
for (let i = 0; i <= 60; i++) {
  ai = analysePacket(packet(500 + i * 4));
  fakeTime += 1000;
}
console.log(`   trend=${ai.gas.trend}, slope=${ai.gas.slopePerMin} ADC/min, time to danger=${ai.gas.timeToDangerSec}s, risk=${ai.riskScore} (${ai.riskLevel})`);
console.log('   reasons:', ai.reasons.join(' | '));

console.log('2) Sudden spike after stable readings:');
resetAiState();
for (let i = 0; i < 30; i++) { analysePacket(packet(400 + (i % 3))); fakeTime += 1000; }
ai = analysePacket(packet(900));
console.log(`   spike=${ai.gas.spike}, z=${ai.gas.zScore}, risk=${ai.riskScore}`);

console.log('3) Fall reported by helmet, then lying still:');
resetAiState();
const fallEvent = { id: 1, peakG: 3.4, minG: 0.25, peakGyro: 300, tiltDeg: 80, stillRatio: 0.9 };
for (let i = 0; i < 15; i++) { ai = analysePacket(packet(300, { fallDetected: true, fallEvent })); fakeTime += 1000; }
console.log(`   fall confidence=${ai.fall.confidence}, still=${ai.stillSeconds}s, risk=${ai.riskScore} (${ai.riskLevel})`);

console.log('4) SOS pressed:');
ai = analysePacket(packet(300, { sosActive: true }));
console.log(`   risk=${ai.riskScore} (${ai.riskLevel}) - ${ai.reasons[0]}`);

console.log('5) LoRa gateway line parsing:');
const p = parseLoraLine('[ANVESHAK_LORA]ANV,ANVESHAK-ESP32-01,42,SOS,1,0,850,-1,410,-1,0.01,0.02,0.99,1,0,2,39.5,1,1,0,0.00,1.00,0,0,0.00|-71|8.2');
console.log(`   device=${p.device} seq=${p.seq} status=${p.status} sos=${p.sosActive} rssi=${p.lora.rssi} snr=${p.lora.snr}`);

Date.now = realNow;
