/**
 * ============================================================================
 * ANVESHAK - IoT Live Safety Monitoring System
 * Complete Working ESP32 Firmware with Dual Cloud Sync (ANVESHAK Web UI + Blynk)
 * ============================================================================
 * 
 * Hardware Pinout Matrix:
 *  - MQ-2 Gas / Smoke Sensor : GPIO 34 (ADC1_CH6)
 *  - Active Buzzer (PWM)     : GPIO 25 (LEDC PWM 2000 Hz, 8-bit resolution)
 *  - I2C Shared Bus (SDA/SCL): GPIO 21 (SDA) / GPIO 22 (SCL)
 *      -> MPU-6050 6-Axis IMU: 0x68
 *      -> 0.96" SSD1306 OLED : 0x3C (128x64)
 *  - SX1278 LoRa Module (SPI): SCK 18, MISO 19, MOSI 23, SS 5, RST 14, DIO0 26
 * 
 * Supported Cloud / Network Targets:
 *  1. ANVESHAK Ingestion Server -> http://10.9.2.238:5000/api/ingest (Streams directly to Web Dashboard)
 *  2. Blynk IoT Cloud           -> Virtual Pins V0 to V10
 *  3. LoRa RF 433 MHz           -> Local point-to-point packet telemetry
 * ============================================================================
 */

#define BLYNK_TEMPLATE_ID   "TMPL3hzn5Mn7B"
#define BLYNK_TEMPLATE_NAME "ANVESHAK"
#define BLYNK_AUTH_TOKEN    "YOUR_BLYNK_AUTH_TOKEN"

#include <WiFi.h>
#include <HTTPClient.h>
#include <BlynkSimpleEsp32.h>
#include <Wire.h>
#include <SPI.h>
#include <LoRa.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

// ========== WIFI CONFIGURATION ==========
char ssid[] = "YOUR_WIFI_SSID";
char pass[] = "YOUR_WIFI_PASSWORD";

// ========== ANVESHAK WEB DASHBOARD INGESTION ENDPOINT ==========
// Set to your computer's local IP where 'node server.js' is running (e.g., http://192.168.1.100:5000/api/ingest)
#define ANVESHAK_SERVER_URL "http://YOUR_SERVER_IP:5000/api/ingest"
#define ANVESHAK_DEVICE_KEY "YOUR_DEVICE_SECRET_KEY"
#define ANVESHAK_DEVICE_ID  "ANVESHAK-ESP32-01"

BlynkTimer timer;

// ========== I2C PIN DEFINITIONS ==========
#define SDA_PIN 21
#define SCL_PIN 22
#define MPU_ADDR 0x68

// ========== MQ-2 GAS SENSOR ==========
#define MQ2_PIN 34
#define GAS_THRESHOLD 1000

// ========== BUZZER CONFIGURATION ==========
#define BUZZER_PIN 25
#define BUZZER_FREQ 2000
#define BUZZER_RESOLUTION 8
#define BUZZER_PWM_CHANNEL 0

// ========== OLED CONFIGURATION ==========
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C

// ========== LORA RF CONFIGURATION ==========
#define LORA_SCK  18
#define LORA_MISO 19
#define LORA_MOSI 23
#define LORA_SS   5
#define LORA_RST  14
#define LORA_DIO0 26
#define LORA_FREQ 433E6

Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

bool oledOK = false;
bool loraOK = false;
bool mpuOK = false;
bool gasAlarmActive = false;
bool buzzerAttached = false;
bool buzzerOn = false;
bool uiSyncOK = false;

unsigned long lastPageChange = 0;
unsigned long lastBeepChange = 0;
unsigned long lastUiSendTime = 0;
unsigned long packetSeq = 0;

int oledPage = 0;
int mq2Value = 0;

float ax = 0, ay = 0, az = 0;
float gx = 0, gy = 0, gz = 0;
float roll = 0, pitch = 0;
float temperature = 0;

// ========== SOUND CONTROLLER (BUZZER HELPER) ==========
void setBuzzerTone(uint32_t freq) {
  #if ESP_ARDUINO_VERSION_MAJOR >= 3
    if (freq > 0) {
      ledcWriteTone(BUZZER_PIN, freq);
    } else {
      ledcWriteTone(BUZZER_PIN, 0);
    }
  #else
    if (freq > 0) {
      ledcWriteTone(BUZZER_PWM_CHANNEL, freq);
    } else {
      ledcWriteTone(BUZZER_PWM_CHANNEL, 0);
    }
  #endif
}

// ========== MPU6050 REGISTER ACCESS ==========
bool writeRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool readRegisters(uint8_t reg, uint8_t *data, uint8_t len) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);

  if (Wire.endTransmission(false) != 0) {
    return false;
  }

  uint8_t received = Wire.requestFrom((uint8_t)MPU_ADDR, len, (uint8_t)true);
  if (received != len) {
    while (Wire.available()) Wire.read();
    return false;
  }

  for (uint8_t i = 0; i < len; i++) {
    data[i] = Wire.read();
  }

  return true;
}

int16_t toInt16(uint8_t highByte, uint8_t lowByte) {
  return (int16_t)(((uint16_t)highByte << 8) | lowByte);
}

// ========== READ SENSORS ==========
void readSensors() {
  uint8_t data[14];

  mpuOK = readRegisters(0x3B, data, 14);
  mq2Value = analogRead(MQ2_PIN);

  if (mpuOK) {
    int16_t axRaw = toInt16(data[0], data[1]);
    int16_t ayRaw = toInt16(data[2], data[3]);
    int16_t azRaw = toInt16(data[4], data[5]);
    int16_t tempRaw = toInt16(data[6], data[7]);
    int16_t gxRaw = toInt16(data[8], data[9]);
    int16_t gyRaw = toInt16(data[10], data[11]);
    int16_t gzRaw = toInt16(data[12], data[13]);

    ax = axRaw / 16384.0f;
    ay = ayRaw / 16384.0f;
    az = azRaw / 16384.0f;

    gx = gxRaw / 131.0f;
    gy = gyRaw / 131.0f;
    gz = gzRaw / 131.0f;

    temperature = (tempRaw / 340.0f) + 36.53f;

    // Attitude Calculation (Degrees)
    if (az != 0 || ax != 0) {
      roll = atan2(-ax, az) * (180.0f / PI);
    }
    float norm = sqrt(ax * ax + az * az);
    if (norm > 0) {
      pitch = atan2(ay, norm) * (180.0f / PI);
    }
  }

  Serial.println("\n--- ANVESHAK TELEMETRY ---");
  Serial.printf("MQ2 ADC: %d (%.2f V)\n", mq2Value, (mq2Value / 4095.0f) * 3.3f);

  if (mpuOK) {
    Serial.printf("Accel(g): X=%.2f Y=%.2f Z=%.2f\n", ax, ay, az);
    Serial.printf("Gyro(deg/s): X=%.1f Y=%.1f Z=%.1f\n", gx, gy, gz);
    Serial.printf("Orientation: Roll=%.1f° Pitch=%.1f° | Temp=%.1f°C\n", roll, pitch, temperature);
  } else {
    Serial.println("MPU READ ERROR");
  }
}

// ========== GAS ALARM AND BUZZER BEEP ==========
void updateGasAlarm() {
  gasAlarmActive = (mq2Value >= GAS_THRESHOLD);

  if (!buzzerAttached) return;

  if (gasAlarmActive) {
    // Pulsing siren: 200 ms ON, 200 ms OFF
    if (millis() - lastBeepChange >= 200) {
      lastBeepChange = millis();
      buzzerOn = !buzzerOn;
      setBuzzerTone(buzzerOn ? BUZZER_FREQ : 0);
    }
  } else {
    if (buzzerOn) {
      buzzerOn = false;
      setBuzzerTone(0);
    }
  }
}

// ========== TELEMETRY TRANSMISSION (ANVESHAK WEB UI + USB SERIAL) ==========
void sendToAnveshakUI() {
  packetSeq++;
  float mqVoltage = (mq2Value / 4095.0f) * 3.3f;

  // Construct telemetry JSON payload
  char jsonBuffer[512];
  snprintf(jsonBuffer, sizeof(jsonBuffer),
    "{"
      "\"device\":\"%s\","
      "\"seq\":%lu,"
      "\"mq2\":{\"rawAdc\":%d,\"voltage\":%.2f},"
      "\"mpu6050\":{"
        "\"accel\":{\"x\":%.3f,\"y\":%.3f,\"z\":%.3f},"
        "\"gyro\":{\"x\":%.2f,\"y\":%.2f,\"z\":%.2f},"
        "\"tempC\":%.2f,"
        "\"roll\":%.1f,"
        "\"pitch\":%.1f"
      "},"
      "\"esp32\":{"
        "\"isOnline\":true,"
        "\"rssi\":%d,"
        "\"ipAddress\":\"%s\","
        "\"uptimeSeconds\":%lu"
      "},"
      "\"lora\":{\"status\":%s},"
      "\"alarmActive\":%s,"
      "\"sosActive\":%s"
    "}",
    ANVESHAK_DEVICE_ID,
    packetSeq,
    mq2Value, mqVoltage,
    ax, ay, az,
    gx, gy, gz,
    temperature,
    roll, pitch,
    WiFi.status() == WL_CONNECTED ? WiFi.RSSI() : 0,
    WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "0.0.0.0",
    millis() / 1000,
    loraOK ? "true" : "false",
    gasAlarmActive ? "true" : "false",
    gasAlarmActive ? "true" : "false"
  );

  // 1. Always output packet to USB Serial (Direct Cable Bridge)
  Serial.print("[ANVESHAK_DATA]");
  Serial.println(jsonBuffer);

  // 2. Transmit via Wi-Fi HTTP POST if Wi-Fi is connected
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(ANVESHAK_SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", ANVESHAK_DEVICE_KEY);
    http.setTimeout(1200);

    int httpCode = http.POST(jsonBuffer);
    if (httpCode == 200 || httpCode == 201) {
      uiSyncOK = true;
      Serial.printf("[UI STREAM] Packet #%lu uploaded to Web Dashboard (HTTP %d)\n", packetSeq, httpCode);
    } else {
      uiSyncOK = false;
      Serial.printf("[UI STREAM FAIL] HTTP %d (Target: %s)\n", httpCode, ANVESHAK_SERVER_URL);
    }
    http.end();
  } else {
    uiSyncOK = false;
  }
}

// ========== BLYNK CLOUD STREAM ==========
void sendToBlynk() {
  if (!Blynk.connected()) return;

  Blynk.virtualWrite(V0, mq2Value);

  if (mpuOK) {
    Blynk.virtualWrite(V1, ax);
    Blynk.virtualWrite(V2, ay);
    Blynk.virtualWrite(V3, az);

    Blynk.virtualWrite(V4, gx);
    Blynk.virtualWrite(V5, gy);
    Blynk.virtualWrite(V6, gz);

    Blynk.virtualWrite(V7, temperature);
  }

  Blynk.virtualWrite(V8, mpuOK ? 1 : 0);
  Blynk.virtualWrite(V9, loraOK ? 1 : 0);
  Blynk.virtualWrite(V10, gasAlarmActive ? 1 : 0);
}

// ========== OLED 0.96" DISPLAY CYCLER ==========
void updateOLED() {
  if (!oledOK) return;

  if (millis() - lastPageChange >= 2500) {
    lastPageChange = millis();
    oledPage = (oledPage + 1) % 3;
  }

  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);

  // Header Bar
  display.println("ANVESHAK MONITOR");
  display.println("----------------");

  if (oledPage == 0) {
    // Page 0: MQ-2 Gas & Safety Alarm Status
    display.printf("MQ-2 ADC: %d\n", mq2Value);
    display.printf("Voltage:  %.2f V\n", (mq2Value / 4095.0f) * 3.3f);
    display.printf("Alarm:    %s\n", gasAlarmActive ? "** ALERT **" : "NORMAL");
    display.printf("Temp:     %.1f C\n", temperature);
  } else if (oledPage == 1) {
    // Page 1: MPU6050 Acceleration & Gyroscope
    if (!mpuOK) {
      display.println("MPU READ ERROR");
    } else {
      display.printf("ACC: %.2f %.2f %.2f\n", ax, ay, az);
      display.printf("GYR: %.1f %.1f %.1f\n", gx, gy, gz);
      display.printf("Roll:  %.0f deg\n", roll);
      display.printf("Pitch: %.0f deg\n", pitch);
    }
  } else {
    // Page 2: System Connectivity & Live UI Status
    display.printf("WiFi: %s\n", WiFi.status() == WL_CONNECTED ? "ONLINE" : "DISCONN");
    display.printf("IP:   %s\n", WiFi.localIP().toString().c_str());
    display.printf("UI:   %s\n", uiSyncOK ? "STREAMING" : "WAITING");
    display.printf("LoRa: %s\n", loraOK ? "READY" : "ERROR");
  }

  display.display();
}

// ========== LORA RF TRANSMISSION ==========
void sendLoRaPacket() {
  if (!loraOK) return;

  char packet[180];
  snprintf(
    packet, sizeof(packet),
    "ANVESHAK,MPU:%d,AX:%.3f,AY:%.3f,AZ:%.3f,"
    "GX:%.2f,GY:%.2f,GZ:%.2f,T:%.2f,MQ2:%d,ALARM:%d",
    mpuOK ? 1 : 0,
    ax, ay, az, gx, gy, gz,
    temperature, mq2Value,
    gasAlarmActive ? 1 : 0
  );

  LoRa.beginPacket();
  LoRa.print(packet);
  if (LoRa.endPacket() == 1) {
    Serial.println("[LoRa] Packet transmitted successfully.");
  } else {
    Serial.println("[LoRa] Transmission failed.");
  }
}

// ========== BLYNK RECONNECTION HANDLER ==========
void reconnectBlynk() {
  if (WiFi.status() == WL_CONNECTED && !Blynk.connected()) {
    Serial.println("Reconnecting to Blynk...");
    Blynk.connect(1000);
  }
}

// ========== SETUP ==========
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n=================================");
  Serial.println(" ANVESHAK IOT TELEMETRY NODE");
  Serial.println("=================================");

  // 1. Buzzer PWM Setup
  #if ESP_ARDUINO_VERSION_MAJOR >= 3
    buzzerAttached = ledcAttach(BUZZER_PIN, BUZZER_FREQ, BUZZER_RESOLUTION);
  #else
    ledcSetup(BUZZER_PWM_CHANNEL, BUZZER_FREQ, BUZZER_RESOLUTION);
    ledcAttachPin(BUZZER_PIN, BUZZER_PWM_CHANNEL);
    buzzerAttached = true;
  #endif

  if (!buzzerAttached) {
    Serial.println("Buzzer PWM initialization failed!");
  } else {
    setBuzzerTone(0);
    Serial.println("Buzzer ready on GPIO 25.");
  }

  // 2. I2C Bus Setup
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  // 3. OLED Display Setup (SSD1306 @ 0x3C)
  oledOK = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
  if (oledOK) {
    display.clearDisplay();
    display.setTextColor(SSD1306_WHITE);
    display.setTextSize(2);
    display.setCursor(10, 5);
    display.println("ANVESHAK");
    display.setTextSize(1);
    display.setCursor(10, 32);
    display.println("Safety Telemetry");
    display.setCursor(10, 48);
    display.println("Connecting WiFi...");
    display.display();
    Serial.println("OLED display ready at 0x3C.");
  } else {
    Serial.println("OLED initialization failed!");
  }

  // 4. MPU6050 Motion Sensor Setup (@ 0x68)
  if (writeRegister(0x6B, 0x00)) {
    delay(100);
    writeRegister(0x1C, 0x00); // 2g accelerometer scale
    writeRegister(0x1B, 0x00); // 250 deg/s gyro scale
    Serial.println("MPU6050 initialized.");
  } else {
    Serial.println("MPU6050 I2C write failed!");
  }

  // 5. MQ-2 Sensor Setup
  pinMode(MQ2_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(MQ2_PIN, ADC_11db);
  Serial.println("MQ-2 configured on GPIO 34 (12-bit ADC).");

  // 6. LoRa Setup (SPI 433 MHz)
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (LoRa.begin(LORA_FREQ)) {
    loraOK = true;
    Serial.println("LoRa transceiver initialized at 433MHz.");
  } else {
    Serial.println("LoRa initialization failed!");
  }

  // 7. Wi-Fi & Blynk Setup
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(ssid, pass);

  Blynk.config(BLYNK_AUTH_TOKEN);

  Serial.printf("Connecting to Wi-Fi SSID '%s'...", ssid);
  unsigned long startAttempt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 15000) {
    delay(250);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("Wi-Fi connected! IP Address: ");
    Serial.println(WiFi.localIP());

    if (Blynk.connect(5000)) {
      Serial.println("Blynk Cloud connected!");
    } else {
      Serial.println("Blynk connection pending (will retry in background).");
    }
  } else {
    Serial.println("Wi-Fi not connected yet. Will retry automatically.");
  }

  // 8. Timed Schedulers
  timer.setInterval(500L, readSensors);        // Read ADC & IMU every 500ms
  timer.setInterval(200L, updateOLED);          // Refresh OLED display
  timer.setInterval(500L, sendToAnveshakUI);   // Stream live to Web UI every 500ms in sync with sensors
  timer.setInterval(1000L, sendToBlynk);        // Stream to Blynk Cloud every 1s
  timer.setInterval(1000L, sendLoRaPacket);     // Send LoRa packet every 1s
  timer.setInterval(5000L, reconnectBlynk);     // Auto-reconnect Blynk
  timer.setInterval(50L, updateGasAlarm);       // Buzzer alarm checks every 50ms

  readSensors();
  updateOLED();

  Serial.println("ANVESHAK SYSTEM READY & RUNNING");
}

// ========== MAIN LOOP ==========
void loop() {
  Blynk.run();
  timer.run();
}
