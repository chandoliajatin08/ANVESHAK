/**
 * ============================================================================
 * ANVESHAK - LoRa RECEIVER GATEWAY FIRMWARE (ESP32 #2)
 * Team XARTH
 * ============================================================================
 *
 * Receives LoRa packets from the helmet and forwards each one to the laptop
 * over USB serial, adding the signal strength:
 *
 *   [ANVESHAK_LORA]<packet text>|<RSSI dBm>|<SNR dB>
 *
 * The backend (backend/anveshak-server.js) reads these lines, runs the AI
 * engine and streams the data to the dashboard. No Wi-Fi or internet needed.
 *
 * Pin map (same LoRa wiring as the helmet)
 *  - LoRa SX1278 (Ra-02): SCK 18, MISO 19, MOSI 23, NSS 5, RST 14, DIO0 26 (3.3 V only)
 *  - OLED (optional)    : SDA 21, SCL 22
 *  - Onboard LED        : GPIO 2 (blinks on every packet)
 * ============================================================================
 */

#include <SPI.h>
#include <LoRa.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define LORA_SCK   18
#define LORA_MISO  19
#define LORA_MOSI  23
#define LORA_SS    5
#define LORA_RST   14
#define LORA_DIO0  26
#define LORA_FREQ  433E6
#define LORA_SYNC  0x12     // must match the helmet

#define LED_PIN    2
#define USE_OLED   1        // 0 if no OLED on the gateway

Adafruit_SSD1306 display(128, 64, &Wire, -1);
bool oledOK = false;
unsigned long packets = 0, lastPacketAt = 0, ledOffAt = 0, lastScreen = 0;
int lastRssi = 0;
float lastSnr = 0;
String lastStatus = "-";

void drawScreen() {
  if (!oledOK) return;
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("ANVESHAK GATEWAY");
  display.println("---------------------");
  display.printf("Packets: %lu\n", packets);
  display.printf("RSSI: %d dBm\n", lastRssi);
  display.printf("SNR : %.1f dB\n", lastSnr);
  if (packets == 0) display.println("Waiting for helmet...");
  else display.printf("Helmet: %s (%lus)\n", lastStatus.c_str(), (millis() - lastPacketAt) / 1000);
  display.display();
}

void setup() {
  Serial.begin(115200);
  delay(300);
  pinMode(LED_PIN, OUTPUT);

  #if USE_OLED
  Wire.begin(21, 22);
  oledOK = display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  #endif

  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_SS);
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);
  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("[GATEWAY] LoRa module NOT found - check 3.3V, wiring and antenna");
    while (true) { digitalWrite(LED_PIN, !digitalRead(LED_PIN)); delay(150); }
  }
  LoRa.setSpreadingFactor(7);
  LoRa.setSignalBandwidth(125E3);
  LoRa.setSyncWord(LORA_SYNC);
  LoRa.enableCrc();

  Serial.println("[GATEWAY] Ready, listening on 433 MHz");
  drawScreen();
}

void loop() {
  int size = LoRa.parsePacket();
  if (size > 0) {
    String msg;
    while (LoRa.available()) msg += (char)LoRa.read();
    msg.trim();

    lastRssi = LoRa.packetRssi();
    lastSnr = LoRa.packetSnr();
    packets++;
    lastPacketAt = millis();

    // Field 4 of the CSV is the helmet status (ANV,device,seq,STATUS,...)
    int c1 = msg.indexOf(','), c2 = msg.indexOf(',', c1 + 1), c3 = msg.indexOf(',', c2 + 1), c4 = msg.indexOf(',', c3 + 1);
    if (c3 > 0 && c4 > c3) lastStatus = msg.substring(c3 + 1, c4);

    Serial.print("[ANVESHAK_LORA]");
    Serial.print(msg);
    Serial.print("|");
    Serial.print(lastRssi);
    Serial.print("|");
    Serial.println(lastSnr, 1);

    digitalWrite(LED_PIN, HIGH);
    ledOffAt = millis() + 80;
  }

  if (ledOffAt && millis() >= ledOffAt) { digitalWrite(LED_PIN, LOW); ledOffAt = 0; }
  if (millis() - lastScreen >= 1000) { lastScreen = millis(); drawScreen(); }
}
