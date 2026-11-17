# ANVESHAK hardware: helmet + gateway

```
 HELMET (worn)                         GATEWAY (with laptop)            LAPTOP
 MQ-2/MQ-4, MPU-6050, OLED,   LoRa     ESP32 + LoRa         USB or      backend/server.js ──► Firebase ──► Dashboard
 buzzer, SOS button, LoRa  ─────────►  lora_gateway.ino    ─────────►   (writes latest, history, alerts)
 helmet_node.ino                                            Wi-Fi
```

You need **two boards**: one in the helmet to send, and one at the gateway to receive.

| Option | Helmet | Gateway | Notes |
|---|---|---|---|
| **Best** | ESP32 | ESP32 | Same 3.3 V logic as the LoRa module. No level shifting needed. |
| OK | ESP32 | Arduino Uno | Connect the gateway to the laptop over USB (the Uno has no Wi-Fi). LoRa wiring needs level shifting (see below). |
| Harder | Arduino Uno | ESP32 | Same level-shifting problem, but on the helmet. Only 2 KB of RAM. |

The helmet always beeps and shows alarms on its own screen. It does not need the gateway or the internet to keep the worker safe.

The firmware is written for the classic Arduino Uno and the ESP32. The **Arduino UNO Q** is a different board and hasn't been tested with this code.

## Antenna (read before powering LoRa)

**Never let the LoRa module transmit without an antenna.** It can burn out the module's transmitter. If you don't have an antenna, solder a straight piece of solid copper wire to the `ANT` pad:

| Module frequency | Wire length (quarter wave) |
|---|---|
| 433 MHz (Ra-02 / SX1278) | **17.3 cm** |
| 865–867 MHz (India band modules) | **8.6 cm** |

Set `LORA_FREQ` the same in both sketches. A wire antenna is enough for a hackathon hall.

## Wiring: helmet on an ESP32

| Part | Part pin → ESP32 pin |
|---|---|
| MQ-2 / MQ-4 | VCC→5V (VIN), GND→GND, **AO→divider→GPIO34** (10 kΩ from AO to GPIO34, 20 kΩ from GPIO34 to GND). AO can reach 5 V and a 5 V signal damages the ESP32. |
| MPU-6050 | VCC→3V3, GND, SDA→21, SCL→22 |
| OLED 0.96" (SSD1306) | VCC→3V3, GND, SDA→21, SCL→22 (shares the bus with the MPU) |
| Buzzer | +→GPIO25, −→GND |
| SOS button | one leg→GPIO4, other leg→GND. Press = SOS. **Hold 3 s = cancel.** |
| LoRa Ra-02 | 3V3, GND, SCK→18, MISO→19, MOSI→23, NSS→5, RST→14, DIO0→26 |

The gateway ESP32 uses the same LoRa pins as the helmet.

**Arduino Uno pins**, if you use one: MQ AO→A0, buzzer→7, SOS→3, I2C on A4/A5, LoRa NSS→10, RST→9, DIO0→2, SCK→13, MISO→12, MOSI→11. The LoRa module runs on **3.3 V only**. Power it from a separate 3.3 V regulator (the Uno's 3V3 pin can't supply enough current), and put a level shifter on SCK, MOSI, NSS and RST.

For a **0.91" OLED (128×32)**, change the display line at the top of `helmet_node.ino` (there's a comment there).

## Gas sensor without calibration

The helmet doesn't try to measure ppm. That would need calibration you don't have. Instead it works like this:

1. For the first **2 minutes** the screen shows `WARMUP` while the heater stabilises.
2. Then it saves the clean-air reading as a **baseline**.
3. It raises a warning at baseline + 400 and danger at baseline + 900 (`GAS_WARN_DELTA`, `GAS_DANGER_DELTA`).

Power it on in clean air. Test it by holding an **unlit** lighter near the sensor and pressing its button for a second to release a little gas, then change the two numbers if needed. The dashboard uses the same alarm level as the helmet, so the buzzer and the dashboard always agree.

The temperature reading is the MPU-6050's **chip temperature**, which runs a few °C above the air temperature.

## Run it

1. In the Arduino IDE, install the **LoRa** library by Sandeep Mistry and the **U8g2** library by olikraus.
2. Flash `helmet_node/helmet_node.ino` to the helmet board and `lora_gateway/lora_gateway.ino` to the gateway board.
3. Plug the gateway into the laptop. Put `serviceAccountKey.json` in `backend/`, then:
   ```bash
   cd backend && npm install && npm start
   ```
4. In another terminal, run `npm run dev` and open the dashboard.
5. Upload `database.rules.json` to Firebase (Console → Realtime Database → Rules, paste it in). The history page needs its `timestamp` index.

If LoRa isn't working, plug the **helmet** into the laptop over USB instead. It prints the same data, and the server reads it the same way.

## Getting 72 hours of history

History is saved every 15 s (and immediately on any alarm), which is about 17,000 rows for 72 hours. To show 72 hours **at the hackathon**, the system has to actually run for 72 hours before you present:

- Start the helmet, gateway and server **at least 3 days before** you present.
- Turn off laptop sleep and keep the laptop plugged in.
- Put the helmet on USB power and leave it in one place.

The **Last 72 Hours** button on the History page then shows the real data. Don't fake it. Judges often ask, and the gaps from real runs look honest.

`anveshak_esp32_firmware/` is the old single-board firmware (ESP32 + Wi-Fi + Blynk). It still works for a one-board demo, but it has no SOS button, and its gas alarm shows up as SOS.
