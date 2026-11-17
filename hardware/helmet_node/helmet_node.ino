/**
 * ANVESHAK — HELMET NODE (worn by the worker)
 *
 * Reads MQ-2 / MQ-4 gas, MPU-6050 (motion + chip temperature), SOS button.
 * Drives the buzzer and OLED locally (works with NO network at all),
 * then sends one compact packet per second over LoRa to the gateway.
 * Also prints the same reading as JSON on USB, so you can plug the helmet
 * straight into the laptop if LoRa is not working.
 *
 * Board: ESP32 (recommended) or Arduino Uno. Pins are in hardware/README.md.
 * Libraries (Library Manager): "LoRa" by Sandeep Mistry, "U8g2" by olikraus.
 */

#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <U8x8lib.h>

// ---------------- PINS ----------------
#if defined(ESP32)
  #define GAS_PIN    34   // via voltage divider! MQ module AO can reach 5 V
  #define BUZZER_PIN 25
  #define SOS_PIN    4    // push button to GND
  #define LORA_SS    5
  #define LORA_RST   14
  #define LORA_DIO0  26
  #define ADC_SHIFT  0    // ESP32 ADC is already 12-bit (0-4095)
#else                     // Arduino Uno
  #define GAS_PIN    A0
  #define BUZZER_PIN 7
  #define SOS_PIN    3
  #define LORA_SS    10
  #define LORA_RST   9
  #define LORA_DIO0  2
  #define ADC_SHIFT  2    // Uno is 10-bit; x4 so the dashboard always sees 0-4095
#endif

#define LORA_FREQ  433E6  // must match your module (Ra-02 = 433E6, 865-867 MHz module = 866E6)
#define MPU_ADDR   0x68

// ---------------- GAS (UNCALIBRATED) ----------------
// No ppm calibration: we learn the clean-air reading during warm-up and
// alarm on how far the reading rises above it. Tune the offsets by testing.
#define GAS_WARMUP_MS   120000UL  // MQ heater needs >= 2 min before readings mean anything
#define GAS_WARN_DELTA  400       // ADC counts above clean-air baseline -> warning
#define GAS_DANGER_DELTA 900      // ADC counts above baseline -> danger (loud buzzer)

#define FALL_G          2.5       // impact threshold in g
#define FALL_HOLD_MS    10000UL   // keep "fall" flag on for 10 s so the dashboard sees it

// 0.96" 128x64 OLED. For a 0.91" 128x32 OLED use U8X8_SSD1306_128X32_UNIVISION_HW_I2C
U8X8_SSD1306_128X64_NONAME_HW_I2C oled(U8X8_PIN_NONE);

bool loraOK = false, mpuOK = false, sosActive = false, sosWasPressed = false;
unsigned long sosPressStart = 0, fallUntil = 0, lastSend = 0, seq = 0;
long gasBaseline = 0;           // 0 = still warming up
float gasAvg = 0;
int gasAdc = 0, gasAlarm = 0;   // 0 ok, 1 warning, 2 danger
float ax, ay, az, gx, gy, gz, tempC, peakG = 0;

bool readMPU() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(MPU_ADDR, 14) != 14) return false;
  int16_t r[7];
  for (int i = 0; i < 7; i++) { uint8_t hi = Wire.read(); r[i] = (hi << 8) | Wire.read(); }
  ax = r[0] / 16384.0; ay = r[1] / 16384.0; az = r[2] / 16384.0;  // +-2 g range
  tempC = r[3] / 340.0 + 36.53;                                    // chip temp, not air temp
  gx = r[4] / 131.0;   gy = r[5] / 131.0;   gz = r[6] / 131.0;     // +-250 deg/s range
  return true;
}

void readGas() {
  gasAdc = analogRead(GAS_PIN) << ADC_SHIFT;
  gasAvg = gasAvg == 0 ? gasAdc : gasAvg * 0.9 + gasAdc * 0.1;  // smooth for baseline
  if (millis() < GAS_WARMUP_MS) { gasAlarm = 0; return; }
  if (gasBaseline == 0) gasBaseline = (long)gasAvg;              // lock clean-air level once
  long delta = gasAdc - gasBaseline;
  gasAlarm = delta >= GAS_DANGER_DELTA ? 2 : delta >= GAS_WARN_DELTA ? 1 : 0;
}

void readSOS() {
  bool pressed = digitalRead(SOS_PIN) == LOW;
  if (pressed && !sosWasPressed) { sosPressStart = millis(); sosActive = true; }
  if (pressed && millis() - sosPressStart > 3000) sosActive = false;  // hold 3 s to cancel
  sosWasPressed = pressed;
}

void updateBuzzer() {
  bool fall = millis() < fallUntil;
  bool fast = sosActive || fall || gasAlarm == 2;
  bool on = fast ? (millis() / 200) % 2 : gasAlarm == 1 ? (millis() % 1000) < 100 : false;
  if (on) tone(BUZZER_PIN, 2000); else noTone(BUZZER_PIN);
}

void updateOLED() {
  char line[17];
  oled.drawString(0, 0, "ANVESHAK HELMET ");
  if (gasBaseline == 0) snprintf(line, sizeof line, "GAS %4d WARMUP ", gasAdc);
  else snprintf(line, sizeof line, "GAS %4d %-7s", gasAdc, gasAlarm == 2 ? "DANGER" : gasAlarm == 1 ? "WARN" : "OK");
  oled.drawString(0, 2, line);
  snprintf(line, sizeof line, "TEMP %3d C      ", (int)tempC);
  oled.drawString(0, 3, mpuOK ? line : "MPU ERROR       ");
  snprintf(line, sizeof line, "G %d.%02d %-8s", (int)peakG, (int)(peakG * 100) % 100, millis() < fallUntil ? "FALL!" : "");
  oled.drawString(0, 4, line);
  oled.drawString(0, 5, sosActive ? "*** SOS ON ***  " : "SOS ready       ");
  oled.drawString(0, 7, loraOK ? "LoRa OK         " : "LoRa FAIL (USB) ");
}

void sendPacket() {
  seq++;
  bool fall = millis() < fallUntil;
  // Integers only (Uno printf has no %f): accel in milli-g, gyro in 0.1 deg/s, temp in 0.1 C.
  char pkt[120];
  snprintf(pkt, sizeof pkt, "AV1,%lu,%d,%ld,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d",
           seq, gasAdc, gasBaseline, gasAlarm,
           (int)(ax * 1000), (int)(ay * 1000), (int)(az * 1000),
           (int)(gx * 10), (int)(gy * 10), (int)(gz * 10), (int)(tempC * 10),
           sosActive, fall, mpuOK);
  if (loraOK) { LoRa.beginPacket(); LoRa.print(pkt); LoRa.endPacket(); }

  // Same reading on USB as JSON, so backend/server.js can read the helmet directly.
  Serial.print(F("[ANVESHAK_DATA]{\"device\":\"ANVESHAK-ESP32-01\",\"seq\":")); Serial.print(seq);
  Serial.print(F(",\"mq2\":{\"rawAdc\":")); Serial.print(gasAdc);
  Serial.print(F(",\"baseline\":")); Serial.print(gasBaseline);
  Serial.print(F(",\"alarm\":")); Serial.print(gasAlarm);
  Serial.print(F("},\"mpu6050\":"));
  if (mpuOK) {
    Serial.print(F("{\"accel\":{\"x\":")); Serial.print(ax, 3);
    Serial.print(F(",\"y\":")); Serial.print(ay, 3);
    Serial.print(F(",\"z\":")); Serial.print(az, 3);
    Serial.print(F("},\"gyro\":{\"x\":")); Serial.print(gx, 1);
    Serial.print(F(",\"y\":")); Serial.print(gy, 1);
    Serial.print(F(",\"z\":")); Serial.print(gz, 1);
    Serial.print(F("},\"tempC\":")); Serial.print(tempC, 1);
    Serial.print('}');
  } else {
    Serial.print(F("null"));
  }
  Serial.print(F(",\"lora\":{\"status\":")); Serial.print(loraOK ? F("true") : F("false"));
  Serial.print(F("},\"fallDetected\":")); Serial.print(fall ? F("true") : F("false"));
  Serial.print(F(",\"sosActive\":")); Serial.print(sosActive ? F("true") : F("false"));
  Serial.println('}');
  peakG = 0;
}

void setup() {
  Serial.begin(115200);
  pinMode(SOS_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);
#if defined(ESP32)
  analogReadResolution(12);
  analogSetPinAttenuation(GAS_PIN, ADC_11db);
#endif
  Wire.begin();
  oled.begin();
  oled.setFont(u8x8_font_chroma48medium8_r);
  oled.clear();

  Wire.beginTransmission(MPU_ADDR);  // wake MPU-6050 (defaults: +-2 g, +-250 deg/s)
  Wire.write(0x6B); Wire.write(0);
  mpuOK = Wire.endTransmission() == 0;

  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  loraOK = LoRa.begin(LORA_FREQ);
  if (loraOK) LoRa.setSyncWord(0xA5);  // ignore other LoRa users nearby; gateway must match
}

void loop() {
  mpuOK = readMPU();
  if (mpuOK) {
    float g = sqrt(ax * ax + ay * ay + az * az);
    if (g > peakG) peakG = g;
    if (g >= FALL_G) fallUntil = millis() + FALL_HOLD_MS;
  }
  readSOS();
  updateBuzzer();
  if (millis() - lastSend >= 1000) {
    lastSend = millis();
    readGas();
    updateOLED();
    sendPacket();
  }
  delay(20);  // ~50 Hz motion sampling so short impacts are not missed
}
