/**
 * ANVESHAK — LoRa GATEWAY (stays with the supervisor / laptop)
 *
 * Receives helmet packets over LoRa and forwards them to backend/server.js:
 *   - always over USB as "[ANVESHAK_DATA]{json}" (plug gateway into the laptop:
 *     works even when hackathon Wi-Fi is bad)
 *   - and, on ESP32 with WIFI_SSID set, also by HTTP POST to /api/ingest.
 *
 * Board: ESP32 (recommended) or Arduino Uno (USB only).
 * Library: "LoRa" by Sandeep Mistry.
 */

#include <SPI.h>
#include <LoRa.h>

#if defined(ESP32)
  #include <WiFi.h>
  #include <HTTPClient.h>
  #define LORA_SS   5
  #define LORA_RST  14
  #define LORA_DIO0 26
  const char *WIFI_SSID  = "";   // leave "" to use USB only
  const char *WIFI_PASS  = "";
  const char *SERVER_URL = "http://192.168.1.100:5000/api/ingest";  // laptop IP running server.js
  const char *DEVICE_KEY = "change-me";                               // same as DEVICE_KEY in backend/.env
#else
  #define LORA_SS   10
  #define LORA_RST  9
  #define LORA_DIO0 2
#endif

#define LORA_FREQ 433E6  // must match the helmet

void setup() {
  Serial.begin(115200);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println(F("[GW] LoRa init failed - check wiring"));
    while (true) delay(1000);
  }
  LoRa.setSyncWord(0xA5);
#if defined(ESP32)
  if (WIFI_SSID[0]) WiFi.begin(WIFI_SSID, WIFI_PASS);
#endif
  Serial.println(F("[GW] listening"));
}

// milli-units -> "1.234" (works on Uno, whose printf has no %f)
String dec(long v, float div, int places) { return String(v / div, places); }

void loop() {
  if (LoRa.parsePacket() == 0) return;

  char buf[121];
  int len = 0;
  while (LoRa.available() && len < 120) buf[len++] = LoRa.read();
  buf[len] = 0;

  // seq, gas, baseline, alarm, ax, ay, az (mg), gx, gy, gz (0.1 dps), temp (0.1 C), sos, fall, mpuOK
  long v[14];
  int n = sscanf(buf, "AV1,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld,%ld",
                 &v[0], &v[1], &v[2], &v[3], &v[4], &v[5], &v[6],
                 &v[7], &v[8], &v[9], &v[10], &v[11], &v[12], &v[13]);
  if (n != 14) {  // noise or someone else's LoRa packet: drop it
    Serial.print(F("[GW] dropped bad packet: "));
    Serial.println(buf);
    return;
  }

  String json = F("{\"device\":\"ANVESHAK-ESP32-01\",\"seq\":");
  json += v[0];
  json += F(",\"mq2\":{\"rawAdc\":"); json += v[1];
  json += F(",\"baseline\":");       json += v[2];
  json += F(",\"alarm\":");          json += v[3];
  json += F("},\"mpu6050\":");
  if (v[13]) {
    json += F("{\"accel\":{\"x\":"); json += dec(v[4], 1000, 3);
    json += F(",\"y\":");            json += dec(v[5], 1000, 3);
    json += F(",\"z\":");            json += dec(v[6], 1000, 3);
    json += F("},\"gyro\":{\"x\":"); json += dec(v[7], 10, 1);
    json += F(",\"y\":");            json += dec(v[8], 10, 1);
    json += F(",\"z\":");            json += dec(v[9], 10, 1);
    json += F("},\"tempC\":");       json += dec(v[10], 10, 1);
    json += '}';
  } else {
    json += F("null");
  }
  json += F(",\"lora\":{\"status\":true},\"sosActive\":"); json += v[11] ? F("true") : F("false");
  json += F(",\"fallDetected\":");                         json += v[12] ? F("true") : F("false");
  json += '}';

  Serial.print(F("[ANVESHAK_DATA]"));
  Serial.println(json);
  Serial.print(F("[GW] rssi="));
  Serial.print(LoRa.packetRssi());
  Serial.print(F(" snr="));
  Serial.println(LoRa.packetSnr());

#if defined(ESP32)
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Key", DEVICE_KEY);
    http.setTimeout(800);  // short, so we don't miss the next LoRa packet
    int code = http.POST(json);
    if (code != 200) { Serial.print(F("[GW] POST failed: ")); Serial.println(code); }
    http.end();
  }
#endif
}
