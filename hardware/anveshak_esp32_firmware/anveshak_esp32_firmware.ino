/**
 * ============================================================================
 * ANVESHAK - Smart Mine Safety Helmet: HELMET NODE FIRMWARE (ESP32)
 * Team XARTH
 * ============================================================================
 *
 * What this firmware does
 *  - Reads MQ-2 (smoke / LPG / combustible gas) and MQ-4 (methane) once a second.
 *  - Reads the MPU6050 50 times a second and runs fall detection on the helmet:
 *      free fall -> impact -> lying still + tilted  ==> FALL
 *  - Reads the SOS button:
 *      short press  = send SOS
 *      hold 2 sec   = cancel SOS / fall alert ("I am OK")
 *  - Local alerts that NEVER depend on LoRa or the laptop:
 *      OLED status, buzzer pattern, alert LED, DFPlayer voice message.
 *  - Sends telemetry:
 *      USB serial JSON  -> "[ANVESHAK_DATA]{...}"      (wired fallback)
 *      LoRa 433 MHz CSV -> "ANV,..." to the gateway     (wireless link)
 *      Wi-Fi HTTP POST  -> optional, OFF by default
 *
 * Pin map (ESP32 DevKit V1)
 *  - MQ-2 AO              : GPIO 34 (through 10k/10k voltage divider)
 *  - MQ-4 AO              : GPIO 35 (through 10k/10k voltage divider)
 *  - I2C SDA / SCL        : GPIO 21 / GPIO 22  (MPU6050 0x68, OLED 0x3C)
 *  - Buzzer (+)           : GPIO 25
 *  - Alert LED            : GPIO 32 (through 220 ohm)
 *  - SOS button           : GPIO 4 to GND (INPUT_PULLUP)
 *  - DFPlayer RX / TX     : GPIO 17 (through 1k) / GPIO 16
 *  - LoRa SX1278 (Ra-02)  : SCK 18, MISO 19, MOSI 23, NSS 5, RST 14, DIO0 26 (3.3 V only)
 *
 * Required libraries (Arduino Library Manager)
 *  - Adafruit GFX Library, Adafruit SSD1306
 *  - LoRa (by Sandeep Mistry)
 *  - DFRobotDFPlayerMini (only if USE_DFPLAYER = 1)
 *  - Blynk (only if USE_BLYNK = 1)
 *
 * SAFETY NOTE: prototype only, not a certified mine safety device.
 * ============================================================================
 */

// ============================================================================
// 1. FEATURE SWITCHES  (1 = on, 0 = off)
// ============================================================================
#define USE_MQ4            1   // MQ-4 methane sensor connected on GPIO 35
#define USE_DFPLAYER       1   // DFPlayer Mini + speaker connected
#define USE_WIFI_HTTP      0   // Also POST JSON over Wi-Fi (keep OFF for the demo: USB / LoRa are enough)
#define USE_BLYNK          0   // Also push to Blynk cloud (needs Wi-Fi)
#define CALIBRATION_MODE   0   // 1 = print R0 values for clean-air calibration of the gas sensors

#if USE_BLYNK
  #define BLYNK_TEMPLATE_ID   "YOUR_BLYNK_TEMPLATE_ID"
  #define BLYNK_TEMPLATE_NAME "ANVESHAK"
  #define BLYNK_AUTH_TOKEN    "YOUR_BLYNK_AUTH_TOKEN"
  #include <BlynkSimpleEsp32.h>
#endif

#if USE_WIFI_HTTP || USE_BLYNK
  #include <WiFi.h>
  #include <HTTPClient.h>
#endif

#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <math.h>

#if USE_DFPLAYER
  #include <DFRobotDFPlayerMini.h>
#endif

// ============================================================================
// 2. NETWORK SETTINGS (only used when USE_WIFI_HTTP / USE_BLYNK = 1)
// ============================================================================
#if USE_WIFI_HTTP || USE_BLYNK
char ssid[] = "YOUR_WIFI_SSID";
char pass[] = "YOUR_WIFI_PASSWORD";
#endif
#define ANVESHAK_SERVER_URL "http://YOUR_SERVER_IP:5000/api/ingest"
#define ANVESHAK_DEVICE_KEY "YOUR_DEVICE_SECRET_KEY"
#define DEVICE_ID           "ANVESHAK-ESP32-01"

// ============================================================================
// 3. PINS
// ============================================================================
#define SDA_PIN      21
#define SCL_PIN      22
#define MPU_ADDR     0x68
#define OLED_ADDR    0x3C

#define MQ2_PIN      34
#define MQ4_PIN      35
#define BUZZER_PIN   25
#define LED_PIN      32
#define SOS_PIN      4

#define DF_RX_PIN    16   // ESP32 RX2  <- DFPlayer TX
#define DF_TX_PIN    17   // ESP32 TX2  -> DFPlayer RX (through 1k)

#define LORA_SCK     18
#define LORA_MISO    19
#define LORA_MOSI    23
#define LORA_SS      5
#define LORA_RST     14
#define LORA_DIO0    26
#define LORA_FREQ    433E6
#define LORA_SYNC    0x12   // must match the gateway

// ============================================================================
// 4. GAS SENSOR CALIBRATION + THRESHOLDS
// ============================================================================
// Hardware: AO -> 10k -> GPIO -> 10k -> GND, so the pin sees half the sensor voltage.
const float ADC_DIVIDER   = 2.0;   // set to 1.0 if you have NO divider (not recommended)
const float SENSOR_VCC    = 5.0;   // MQ sensor supply voltage
const float RL_KOHM       = 1.0;   // load resistor on the module: "102" = 1k, "103" = 10k

// Paste your clean-air R0 values here after running CALIBRATION_MODE = 1.
// While R0 = 0, the sensor is "uncalibrated" and raw ADC thresholds are used instead.
float MQ2_R0 = 0.0;   // kOhm
float MQ4_R0 = 0.0;   // kOhm

// Datasheet curves: ppm = A * (Rs/R0)^B
const float MQ2_CLEAN_AIR_RATIO = 9.83;   const float MQ2_A = 574.25; const float MQ2_B = -2.222;  // LPG curve
const float MQ4_CLEAN_AIR_RATIO = 4.4;    const float MQ4_A = 1012.7; const float MQ4_B = -2.786;  // CH4 curve

// DEMO thresholds (not certified mine limits)
const int   GAS_RAW_WARNING  = 800;    // raw ADC, used only while uncalibrated
const int   GAS_RAW_DANGER   = 1000;
const float MQ2_PPM_WARNING  = 300;
const float MQ2_PPM_DANGER   = 1000;
const float MQ4_PPM_WARNING  = 1000;   // methane
const float MQ4_PPM_DANGER   = 5000;

// ============================================================================
// 5. FALL DETECTION SETTINGS  (tune these with your own test data)
// ============================================================================
const float FREEFALL_G        = 0.40;   // total acceleration below this = falling
const float IMPACT_G          = 2.50;   // impact after free fall
const float HARD_IMPACT_G     = 3.50;   // impact strong enough even without clear free fall
const unsigned long FREEFALL_TO_IMPACT_MS = 600;
const unsigned long STILL_WINDOW_MS       = 5000;  // how long to watch for "lying still" after impact
const float STILL_RATIO_NEEDED = 0.75;  // 75% of samples must be still
const float TILT_CHANGE_DEG    = 45.0;  // helmet must end up tilted this much vs normal
const unsigned long LONG_PRESS_MS = 2000;

// ============================================================================
// 6. DFPLAYER TRACKS  (SD card: folder "mp3", files 0001.mp3, 0002.mp3 ...)
// ============================================================================
#define TRACK_GAS_WARNING  1   // "Gas level rising, be careful"
#define TRACK_GAS_DANGER   2   // "Gas level high, evacuate now"
#define TRACK_FALL         3   // "Fall detected, help is coming"
#define TRACK_SOS          4   // "SOS sent"
#define TRACK_ALL_CLEAR    5   // "Alert cleared"
#define VOICE_REPEAT_MS    15000

// ============================================================================
// GLOBAL STATE
// ============================================================================
Adafruit_SSD1306 display(128, 64, &Wire, -1);
#if USE_DFPLAYER
HardwareSerial dfSerial(2);
DFRobotDFPlayerMini dfPlayer;
#endif
#if USE_BLYNK
BlynkTimer blynkTimer;
#endif

bool oledOK = false, loraOK = false, mpuOK = false, dfOK = false, buzzerOK = false;

// Sensor values
int   mq2Adc = 0, mq4Adc = 0;
float mq2Rs = 0, mq4Rs = 0, mq2Ratio = -1, mq4Ratio = -1, mq2Ppm = -1, mq4Ppm = -1;
float ax = 0, ay = 0, az = 1, gx = 0, gy = 0, gz = 0, devTempC = 0, roll = 0, pitch = 0;
float accelMag = 1.0, gyroMag = 0;

// Status
enum Status { ST_NORMAL, ST_WARNING, ST_DANGER, ST_FALL, ST_SOS };
const char* STATUS_NAMES[] = { "NORMAL", "WARNING", "DANGER", "FALL", "SOS" };
Status status = ST_NORMAL, lastStatus = ST_NORMAL;
int  gasLevel = 0;            // 0 normal, 1 warning, 2 danger
bool sosActive = false, fallActive = false;

// Fall detection state
enum FallStage { FS_IDLE, FS_FREEFALL, FS_WATCHING };
FallStage fallStage = FS_IDLE;
unsigned long freefallAt = 0, impactAt = 0;
float minGWindow = 1.0, peakG = 0, peakGyro = 0;
int   stillCount = 0, sampleCount = 0;
float refX = 0, refY = 0, refZ = 1;   // "normal" helmet orientation (slow average)
// Last impact event (sent to the backend AI engine)
unsigned long impactId = 0;
float evPeakG = 0, evMinG = 1, evPeakGyro = 0, evTilt = 0, evStill = 0;

// Button
bool btnDown = false, longPressDone = false;
unsigned long btnDownAt = 0, btnChangeAt = 0;

// Timers
unsigned long tImu = 0, tGas = 0, tOled = 0, tUsb = 0, tLora = 0, tDebug = 0, tVoice = 0, tBeep = 0, tCal = 0;
#if USE_WIFI_HTTP
unsigned long tHttp = 0, httpRetryAfter = 0;
bool httpOK = false;
#endif
unsigned long seq = 0, loraSent = 0;
bool urgentSend = false;
int  beepStep = 0, oledPage = 0;
unsigned long tPage = 0;

// ============================================================================
// SMALL HELPERS
// ============================================================================
void setBuzzer(bool on) {
  if (!buzzerOK) return;
  #if ESP_ARDUINO_VERSION_MAJOR >= 3
    ledcWriteTone(BUZZER_PIN, on ? 2000 : 0);
  #else
    ledcWriteTone(0, on ? 2000 : 0);
  #endif
}

void playVoice(int track) {
  #if USE_DFPLAYER
    if (dfOK) dfPlayer.playMp3Folder(track);
  #endif
}

bool mpuWrite(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  return Wire.endTransmission() == 0;
}

bool mpuRead(uint8_t reg, uint8_t* buf, uint8_t len) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((uint8_t)MPU_ADDR, len, (uint8_t)true) != len) {
    while (Wire.available()) Wire.read();
    return false;
  }
  for (uint8_t i = 0; i < len; i++) buf[i] = Wire.read();
  return true;
}

int16_t i16(uint8_t h, uint8_t l) { return (int16_t)(((uint16_t)h << 8) | l); }

// ============================================================================
// GAS SENSORS
// ============================================================================
// Average 10 quick readings and return the sensor's own output voltage (before the divider)
float readSensorVolts(int pin, int& rawOut) {
  uint32_t mv = 0, raw = 0;
  for (int i = 0; i < 10; i++) {
    mv  += analogReadMilliVolts(pin);
    raw += analogRead(pin);
  }
  rawOut = raw / 10;
  return (mv / 10.0f) / 1000.0f * ADC_DIVIDER;
}

float sensorRs(float volts) {
  if (volts < 0.01f) volts = 0.01f;
  return RL_KOHM * (SENSOR_VCC - volts) / volts;
}

void readGas() {
  mq2Rs = sensorRs(readSensorVolts(MQ2_PIN, mq2Adc));
  if (MQ2_R0 > 0) {
    mq2Ratio = mq2Rs / MQ2_R0;
    mq2Ppm   = MQ2_A * pow(mq2Ratio, MQ2_B);
  }

  #if USE_MQ4
  mq4Rs = sensorRs(readSensorVolts(MQ4_PIN, mq4Adc));
  if (MQ4_R0 > 0) {
    mq4Ratio = mq4Rs / MQ4_R0;
    mq4Ppm   = MQ4_A * pow(mq4Ratio, MQ4_B);
  }
  #endif

  // Gas level = worst of the two sensors
  int lvl2, lvl4 = 0;
  if (MQ2_R0 > 0) lvl2 = mq2Ppm >= MQ2_PPM_DANGER ? 2 : (mq2Ppm >= MQ2_PPM_WARNING ? 1 : 0);
  else            lvl2 = mq2Adc >= GAS_RAW_DANGER ? 2 : (mq2Adc >= GAS_RAW_WARNING ? 1 : 0);
  #if USE_MQ4
  if (MQ4_R0 > 0) lvl4 = mq4Ppm >= MQ4_PPM_DANGER ? 2 : (mq4Ppm >= MQ4_PPM_WARNING ? 1 : 0);
  else            lvl4 = mq4Adc >= GAS_RAW_DANGER ? 2 : (mq4Adc >= GAS_RAW_WARNING ? 1 : 0);
  #endif
  gasLevel = max(lvl2, lvl4);
}

// ============================================================================
// MOTION + FALL DETECTION (runs 50 times per second)
// ============================================================================
void readImu() {
  uint8_t d[14];
  mpuOK = mpuRead(0x3B, d, 14);
  if (!mpuOK) return;

  ax = i16(d[0], d[1]) / 8192.0f;    // +-4 g range (set in setup)
  ay = i16(d[2], d[3]) / 8192.0f;
  az = i16(d[4], d[5]) / 8192.0f;
  devTempC = i16(d[6], d[7]) / 340.0f + 36.53f;   // MPU6050 chip temperature, NOT ambient air
  gx = i16(d[8], d[9]) / 65.5f;      // +-500 deg/s range (set in setup)
  gy = i16(d[10], d[11]) / 65.5f;
  gz = i16(d[12], d[13]) / 65.5f;

  accelMag = sqrt(ax * ax + ay * ay + az * az);
  gyroMag  = sqrt(gx * gx + gy * gy + gz * gz);
  roll  = atan2(-ax, az) * 180.0f / PI;
  pitch = atan2(ay, sqrt(ax * ax + az * az)) * 180.0f / PI;
}

float tiltFromReference() {
  float n = accelMag > 0.05f ? accelMag : 1.0f;
  float rn = sqrt(refX * refX + refY * refY + refZ * refZ);
  if (rn < 0.05f) return 0;
  float c = (ax * refX + ay * refY + az * refZ) / (n * rn);
  c = constrain(c, -1.0f, 1.0f);
  return acos(c) * 180.0f / PI;
}

void updateFallDetection(unsigned long now) {
  if (!mpuOK) return;
  bool still = fabs(accelMag - 1.0f) < 0.15f && gyroMag < 30.0f;

  switch (fallStage) {
    case FS_IDLE:
      // Slowly learn the normal (upright) helmet orientation while nothing is happening
      if (still && !fallActive) {
        refX = refX * 0.98f + ax * 0.02f;
        refY = refY * 0.98f + ay * 0.02f;
        refZ = refZ * 0.98f + az * 0.02f;
      }
      if (accelMag < FREEFALL_G) {
        fallStage = FS_FREEFALL; freefallAt = now; minGWindow = accelMag;
      } else if (accelMag > HARD_IMPACT_G) {
        minGWindow = 1.0; // no clear free fall, but a very hard hit
        fallStage = FS_WATCHING; impactAt = now; peakG = accelMag; peakGyro = gyroMag;
        stillCount = 0; sampleCount = 0;
      }
      break;

    case FS_FREEFALL:
      minGWindow = min(minGWindow, accelMag);
      if (accelMag > IMPACT_G) {
        fallStage = FS_WATCHING; impactAt = now; peakG = accelMag; peakGyro = gyroMag;
        stillCount = 0; sampleCount = 0;
      } else if (now - freefallAt > FREEFALL_TO_IMPACT_MS) {
        fallStage = FS_IDLE;  // fell "softly" or was just a jump: ignore
      }
      break;

    case FS_WATCHING:
      // First 500 ms after impact: still bouncing, only record the peak
      if (now - impactAt < 500) {
        peakG = max(peakG, accelMag);
        peakGyro = max(peakGyro, gyroMag);
        break;
      }
      sampleCount++;
      if (still) stillCount++;
      if (now - impactAt >= STILL_WINDOW_MS) {
        float stillRatio = sampleCount ? (float)stillCount / sampleCount : 0;
        float tilt = tiltFromReference();

        // Save this impact event for the backend AI engine
        impactId++;
        evPeakG = peakG; evMinG = minGWindow; evPeakGyro = peakGyro; evTilt = tilt; evStill = stillRatio;

        if (stillRatio >= STILL_RATIO_NEEDED && tilt >= TILT_CHANGE_DEG) {
          fallActive = true;
          Serial.printf("[FALL] Confirmed: peak %.2fg, min %.2fg, tilt %.0f deg, still %.0f%%\n",
                        peakG, minGWindow, tilt, stillRatio * 100);
        } else {
          Serial.printf("[FALL] Impact ignored: tilt %.0f deg, still %.0f%%\n", tilt, stillRatio * 100);
        }
        urgentSend = true;
        fallStage = FS_IDLE;
      }
      break;
  }
}

// ============================================================================
// SOS BUTTON  (short press = SOS, hold 2 s = cancel all alerts)
// ============================================================================
void handleButton(unsigned long now) {
  bool pressed = digitalRead(SOS_PIN) == LOW;
  if (pressed != btnDown && now - btnChangeAt > 40) {      // debounce
    btnChangeAt = now;
    btnDown = pressed;
    if (pressed) {
      btnDownAt = now; longPressDone = false;
    } else if (!longPressDone) {
      sosActive = true;                                    // short press
      urgentSend = true;
      Serial.println("[SOS] Button pressed - SOS ACTIVE");
    }
  }
  if (btnDown && !longPressDone && now - btnDownAt >= LONG_PRESS_MS) {
    longPressDone = true;                                  // long press
    if (sosActive || fallActive) {
      sosActive = false; fallActive = false; urgentSend = true;
      playVoice(TRACK_ALL_CLEAR);
      Serial.println("[SOS] Long press - alerts cancelled");
    }
  }
}

// ============================================================================
// STATUS + LOCAL ALERTS (buzzer, LED, voice)
// ============================================================================
void updateStatus(unsigned long now) {
  if (sosActive)          status = ST_SOS;
  else if (fallActive)    status = ST_FALL;
  else if (gasLevel == 2) status = ST_DANGER;
  else if (gasLevel == 1) status = ST_WARNING;
  else                    status = ST_NORMAL;

  if (status != lastStatus) {
    Serial.printf("[STATUS] %s -> %s\n", STATUS_NAMES[lastStatus], STATUS_NAMES[status]);
    switch (status) {
      case ST_SOS:     playVoice(TRACK_SOS);         break;
      case ST_FALL:    playVoice(TRACK_FALL);        break;
      case ST_DANGER:  playVoice(TRACK_GAS_DANGER);  break;
      case ST_WARNING: playVoice(TRACK_GAS_WARNING); break;
      case ST_NORMAL:  if (lastStatus == ST_DANGER || lastStatus == ST_WARNING) playVoice(TRACK_ALL_CLEAR); break;
    }
    lastStatus = status;
    tVoice = now;
    beepStep = 0;
    urgentSend = true;
  } else if (status >= ST_DANGER && now - tVoice >= VOICE_REPEAT_MS) {
    // Repeat the voice message while the danger continues
    tVoice = now;
    playVoice(status == ST_SOS ? TRACK_SOS : status == ST_FALL ? TRACK_FALL : TRACK_GAS_DANGER);
  }
}

void updateBuzzerAndLed(unsigned long now) {
  // Each pattern is a list of ON/OFF durations in ms
  static const uint16_t SOS_P[]  = {100, 100, 100, 100, 100, 600};
  static const uint16_t FALL_P[] = {500, 500};
  static const uint16_t DANG_P[] = {200, 200};
  static const uint16_t WARN_P[] = {100, 900};
  const uint16_t* p = nullptr; int n = 0;
  switch (status) {
    case ST_SOS:     p = SOS_P;  n = 6; break;
    case ST_FALL:    p = FALL_P; n = 2; break;
    case ST_DANGER:  p = DANG_P; n = 2; break;
    case ST_WARNING: p = WARN_P; n = 2; break;
    default: break;
  }
  if (!p) { setBuzzer(false); digitalWrite(LED_PIN, LOW); return; }

  if (now - tBeep >= p[beepStep % n]) {
    tBeep = now;
    beepStep = (beepStep + 1) % n;
  }
  bool on = (beepStep % 2) == 0;
  setBuzzer(on);
  digitalWrite(LED_PIN, on ? HIGH : LOW);
}

// ============================================================================
// OLED
// ============================================================================
void updateOled(unsigned long now) {
  if (!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (status != ST_NORMAL) {
    // Big alert screen
    display.setTextSize(1); display.setCursor(0, 0); display.println("ANVESHAK  ** ALERT **");
    display.setTextSize(2); display.setCursor(0, 18);
    if (status == ST_SOS)          display.println("SOS SENT");
    else if (status == ST_FALL)    display.println("FALL!");
    else if (status == ST_DANGER)  display.println("GAS DANGER");
    else                           display.println("GAS WARN");
    display.setTextSize(1); display.setCursor(0, 44);
    if (status >= ST_FALL) display.println("Hold button 2s=cancel");
    else display.printf("MQ2:%d MQ4:%d\n", mq2Adc, mq4Adc);
    display.setCursor(0, 56); display.printf("LoRa:%s #%lu", loraOK ? "OK" : "ERR", loraSent);
    display.display();
    return;
  }

  if (now - tPage >= 2500) { tPage = now; oledPage = (oledPage + 1) % 3; }
  display.setTextSize(1); display.setCursor(0, 0);
  display.println("ANVESHAK MINER  OK");
  display.println("---------------------");
  if (oledPage == 0) {
    if (MQ2_R0 > 0) display.printf("MQ-2: %.0f ppm\n", mq2Ppm); else display.printf("MQ-2: %d adc\n", mq2Adc);
    #if USE_MQ4
    if (MQ4_R0 > 0) display.printf("CH4 : %.0f ppm\n", mq4Ppm); else display.printf("MQ-4: %d adc\n", mq4Adc);
    #endif
    display.printf("DevT: %.1f C\n", devTempC);
  } else if (oledPage == 1) {
    if (!mpuOK) display.println("MPU READ ERROR");
    else {
      display.printf("G: %.2f  Gyro:%.0f\n", accelMag, gyroMag);
      display.printf("Roll:%.0f Pitch:%.0f\n", roll, pitch);
      display.printf("Tilt: %.0f deg\n", tiltFromReference());
    }
  } else {
    display.printf("LoRa: %s\n", loraOK ? "READY" : "ERROR");
    display.printf("Sent: %lu pkts\n", loraSent);
    display.printf("Voice: %s\n", dfOK ? "READY" : "OFF");
  }
  display.display();
}

// ============================================================================
// TELEMETRY: USB JSON
// ============================================================================
void sendUsbJson() {
  seq++;
  char buf[900];
  snprintf(buf, sizeof(buf),
    "{\"device\":\"%s\",\"seq\":%lu,\"status\":\"%s\","
    "\"mq2\":{\"rawAdc\":%d,\"ratio\":%.3f,\"ppm\":%.0f,\"calibrated\":%s},"
    "\"mq4\":{\"rawAdc\":%d,\"ratio\":%.3f,\"ppm\":%.0f,\"calibrated\":%s,\"enabled\":%s},"
    "\"mpu6050\":{\"accel\":{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f},\"gyro\":{\"x\":%.2f,\"y\":%.2f,\"z\":%.2f},"
    "\"tempC\":%.2f,\"roll\":%.1f,\"pitch\":%.1f},"
    "\"fallDetected\":%s,\"sosActive\":%s,\"alarmActive\":%s,\"gasLevel\":%d,"
    "\"fallEvent\":{\"id\":%lu,\"peakG\":%.2f,\"minG\":%.2f,\"peakGyro\":%.0f,\"tiltDeg\":%.0f,\"stillRatio\":%.2f},"
    "\"esp32\":{\"isOnline\":true,\"uptimeSeconds\":%lu,\"freeHeap\":%u},"
    "\"lora\":{\"moduleReady\":%s,\"packetsSent\":%lu},"
    "\"voice\":{\"ready\":%s}}",
    DEVICE_ID, seq, STATUS_NAMES[status],
    mq2Adc, mq2Ratio, mq2Ppm, MQ2_R0 > 0 ? "true" : "false",
    mq4Adc, mq4Ratio, mq4Ppm, MQ4_R0 > 0 ? "true" : "false", USE_MQ4 ? "true" : "false",
    ax, ay, az, gx, gy, gz, devTempC, roll, pitch,
    fallActive ? "true" : "false", sosActive ? "true" : "false", gasLevel == 2 ? "true" : "false", gasLevel,
    impactId, evPeakG, evMinG, evPeakGyro, evTilt, evStill,
    millis() / 1000, (unsigned)ESP.getFreeHeap(),
    loraOK ? "true" : "false", loraSent,
    dfOK ? "true" : "false");

  Serial.print("[ANVESHAK_DATA]");
  Serial.println(buf);

  #if USE_WIFI_HTTP
  unsigned long now = millis();
  if (WiFi.status() == WL_CONNECTED && now >= httpRetryAfter && now - tHttp >= 2000) {
    tHttp = now;
    HTTPClient http;
    http.begin(ANVESHAK_SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", ANVESHAK_DEVICE_KEY);
    http.setTimeout(800);
    int code = http.POST(buf);
    http.end();
    httpOK = (code == 200 || code == 201);
    if (!httpOK) httpRetryAfter = now + 10000;   // back off so local alerts are never delayed for long
  }
  #endif
}

// ============================================================================
// TELEMETRY: LoRa CSV (short, fits in one LoRa packet)
// ANV,device,loraSeq,status,sos,fall,mq2Adc,mq2Ppm,mq4Adc,mq4Ppm,ax,ay,az,gx,gy,gz,
//     devTemp,roll,pitch,impactId,peakG,minG,peakGyro,tilt,still
// ============================================================================
void sendLoRa() {
  if (!loraOK) return;
  if (!LoRa.beginPacket()) return;   // previous packet still transmitting: try next time
  loraSent++;                        // LoRa has its own sequence number, so the dashboard can count lost packets
  char p[230];
  snprintf(p, sizeof(p),
    "ANV,%s,%lu,%s,%d,%d,%d,%.0f,%d,%.0f,%.2f,%.2f,%.2f,%.0f,%.0f,%.0f,%.1f,%.0f,%.0f,%lu,%.2f,%.2f,%.0f,%.0f,%.2f",
    DEVICE_ID, loraSent, STATUS_NAMES[status], sosActive ? 1 : 0, fallActive ? 1 : 0,
    mq2Adc, mq2Ppm, mq4Adc, mq4Ppm, ax, ay, az, gx, gy, gz,
    devTempC, roll, pitch, impactId, evPeakG, evMinG, evPeakGyro, evTilt, evStill);
  LoRa.print(p);
  LoRa.endPacket(true);   // async: does not block fall detection
}

// ============================================================================
// SETUP
// ============================================================================
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n=== ANVESHAK HELMET NODE ===");

  pinMode(SOS_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  #if ESP_ARDUINO_VERSION_MAJOR >= 3
    buzzerOK = ledcAttach(BUZZER_PIN, 2000, 8);
  #else
    ledcSetup(0, 2000, 8); ledcAttachPin(BUZZER_PIN, 0); buzzerOK = true;
  #endif
  setBuzzer(false);

  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(400000);   // fast I2C so the OLED does not slow down fall detection

  oledOK = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (oledOK) {
    display.clearDisplay(); display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2); display.setCursor(10, 8); display.println("ANVESHAK");
    display.setTextSize(1); display.setCursor(10, 36); display.println("Gas sensors warming");
    display.display();
  }
  Serial.println(oledOK ? "OLED ready" : "OLED not found");

  if (mpuWrite(0x6B, 0x00)) {          // wake up
    delay(50);
    mpuWrite(0x1C, 0x08);              // accelerometer +-4 g (so 2.5-3.5 g impacts are not clipped)
    mpuWrite(0x1B, 0x08);              // gyro +-500 deg/s
    Serial.println("MPU6050 ready");
  } else {
    Serial.println("MPU6050 not found");
  }

  analogReadResolution(12);
  analogSetPinAttenuation(MQ2_PIN, ADC_11db);
  analogSetPinAttenuation(MQ4_PIN, ADC_11db);

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  loraOK = LoRa.begin(LORA_FREQ);
  if (loraOK) {
    LoRa.setSpreadingFactor(7);
    LoRa.setSignalBandwidth(125E3);
    LoRa.setSyncWord(LORA_SYNC);
    LoRa.enableCrc();
  }
  Serial.println(loraOK ? "LoRa module ready (433 MHz)" : "LoRa module NOT found - check 3.3V, wiring, antenna");

  #if USE_DFPLAYER
    dfSerial.begin(9600, SERIAL_8N1, DF_RX_PIN, DF_TX_PIN);
    dfOK = dfPlayer.begin(dfSerial, true, true);
    if (dfOK) dfPlayer.volume(25);     // 0..30
    Serial.println(dfOK ? "DFPlayer ready" : "DFPlayer not found - check SD card and RX/TX");
  #endif

  #if USE_WIFI_HTTP || USE_BLYNK
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, pass);
    #if USE_BLYNK
      Blynk.config(BLYNK_AUTH_TOKEN);
    #endif
  #endif

  Serial.println("ANVESHAK READY");
}

// ============================================================================
// LOOP  (non-blocking: every task runs on its own timer)
// ============================================================================
void loop() {
  unsigned long now = millis();

  if (now - tImu >= 20) {            // 50 Hz motion + fall detection
    tImu = now;
    readImu();
    updateFallDetection(now);
  }
  if (now - tGas >= 1000) {          // 1 Hz gas
    tGas = now;
    readGas();
  }
  handleButton(now);
  updateStatus(now);
  updateBuzzerAndLed(now);

  if (now - tOled >= 500) { tOled = now; updateOled(now); }

  if (urgentSend || now - tUsb >= 500) { tUsb = now; sendUsbJson(); }
  if (urgentSend || now - tLora >= 1000) { tLora = now; sendLoRa(); }
  urgentSend = false;

  #if CALIBRATION_MODE
  if (now - tCal >= 2000) {
    tCal = now;
    Serial.printf("[CAL] Keep sensors in CLEAN AIR, warmed up 20+ min. MQ2_R0 = %.3f  MQ4_R0 = %.3f (kOhm)\n",
                  mq2Rs / MQ2_CLEAN_AIR_RATIO, mq4Rs / MQ4_CLEAN_AIR_RATIO);
  }
  #endif

  if (now - tDebug >= 2000) {
    tDebug = now;
    Serial.printf("[DBG] status=%s gas2=%d gas4=%d g=%.2f tilt=%.0f lora=%s voice=%s\n",
                  STATUS_NAMES[status], mq2Adc, mq4Adc, accelMag, tiltFromReference(),
                  loraOK ? "ok" : "err", dfOK ? "ok" : "off");
  }

  #if USE_BLYNK
  if (WiFi.status() == WL_CONNECTED) {
    Blynk.run();
    static unsigned long tBlynk = 0;
    if (now - tBlynk >= 1000 && Blynk.connected()) {
      tBlynk = now;
      Blynk.virtualWrite(V0, mq2Adc);
      Blynk.virtualWrite(V1, ax); Blynk.virtualWrite(V2, ay); Blynk.virtualWrite(V3, az);
      Blynk.virtualWrite(V7, devTempC);
      Blynk.virtualWrite(V10, status == ST_NORMAL ? 0 : 1);
    }
  }
  #endif
}
