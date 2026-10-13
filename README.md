# ANVESHAK — IoT Live Safety & Environmental Monitoring System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Frontend](https://img.shields.io/badge/Frontend-React%2019%20%7C%20Vite%20%7C%20Tailwind-cyan)](https://react.dev/)
[![Backend](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20SerialPort-green)](https://nodejs.org/)
[![Hardware](https://img.shields.io/badge/Hardware-ESP32%20%7C%20MQ--2%20%7C%20MPU6050-red)](https://espressif.com/)

**ANVESHAK** (*Sanskrit for "Explorer / Investigator"*) is a real-time edge-to-cloud safety telemetry system designed to monitor hazardous environmental conditions, gas/smoke concentrations, worker orientation, and emergency SOS signals in real time.

The system combines an **ESP32 microcontroller edge node** with an **Express.js ingestion microservice** and a **React 19 mission-control web dashboard**, delivering live sensor feeds with zero synthetic interpolation in live mode.

---

## 📌 Problem Statement

Industrial personnel, mining workers, and disaster response teams frequently operate in hazardous environments susceptible to:
- Invisible toxic gas accumulation and flammable smoke leaks (LPG, Propane, Methane, Smoke).
- Physical trauma, sudden falls, impacts, and disorientation.
- Thermal stress and equipment overheating.
- Communication blackouts where standard consumer Wi-Fi or cellular networks are unavailable.

Traditional stationary monitors lack individual worker telemetry, while disconnected wearable alarms fail to notify remote supervisors instantly. ANVESHAK addresses this by providing localized on-device safety alarms alongside high-frequency telemetry streaming to centralized monitoring dashboards.

---

## 🎯 Project Objectives

1. **Multi-Hazard Edge Telemetry**: Continuously sample gas/smoke levels, 6-axis spatial motion, attitude (roll/pitch), and temperature directly at the edge.
2. **Immediate Local Alerting**: Trigger a piercing 2000 Hz acoustic piezo buzzer on the edge device whenever gas thresholds ($\ge 1000\text{ ADC}$) or emergency SOS triggers are breached.
3. **Dual-Channel Telemetry Stream**: Support direct USB cable serial streaming (115200 baud) for zero-dependency local operation as well as Wi-Fi HTTP POST and cloud synchronization.
4. **Mission-Control Web Interface**: Present live readings, waveform histories, 3D attitude representations, and an exact virtual mirror of the physical 0.96-inch OLED screen.
5. **Truthful Status Indication**: Implement automatic heartbeat timeouts ($15\text{ seconds}$) that flag the device as offline rather than displaying stale or fabricated sensor values.

---

## ⚙️ System Architecture & Data Flow

```mermaid
graph TD
    subgraph "Edge Hardware Layer"
        MQ2["MQ-2 Gas Sensor\n(GPIO 34 ADC)"] --> ESP32["ESP32 Microcontroller\n(240MHz Dual-Core)"]
        MPU["MPU-6050 IMU\n(I2C 0x68)"] --> ESP32
        OLED["SSD1306 0.96'' OLED\n(I2C 0x3C)"] <-- ESP32
        BUZZ["Active Buzzer\n(GPIO 25 PWM 2000Hz)"] <-- ESP32
        LORA["SX1278 LoRa 433MHz\n(SPI Transceiver)"] <-- ESP32
    end

    subgraph "Ingestion & Bridge Layer (Port 5000)"
        ESP32 -- "USB Serial (115200 baud)\n[ANVESHAK_DATA] / Raw Text" --> BRIDGE["Node.js Express Server\n(backend/server.js)"]
        ESP32 -. "Wi-Fi HTTP POST\n(/api/ingest)" .-> BRIDGE
        BRIDGE -- "Optional Non-blocking" --> RTDB["Firebase Realtime Database\n(/devices/ANVESHAK-ESP32-01)"]
    end

    subgraph "Frontend Presentation Layer (Port 5173)"
        BRIDGE -- "Server-Sent Events (SSE)\nGET /api/stream" --> UI["React 19 Dashboard\n(Vite + Tailwind CSS)"]
        BRIDGE -- "1s Snapshot Polling\nGET /api/latest" --> UI
        RTDB -. "Client SDK Listener\n(Optional Cloud Mode)" .-> UI
        UI --> AUDIO["Web Audio API\n(2000 Hz Piezo Siren)"]
    end
```

---

## 🛠️ Hardware Components & Bill of Materials

| Component | Model / Spec | Purpose in System |
| :--- | :--- | :--- |
| **Microcontroller** | ESP32-WROOM-32D | Edge compute, ADC acquisition, I2C/SPI master, telemetry transmission |
| **Gas & Smoke Sensor** | MQ-2 Analog Detector | Measures combustible gas and smoke concentration (0–4095 12-bit ADC) |
| **Motion Sensor** | MPU-6050 6-Axis IMU | 3-axis accelerometer ($\pm 2g$), 3-axis gyroscope ($\pm 250^\circ/\text{s}$), internal temperature |
| **Local Display** | SSD1306 0.96" OLED | 128x64 monochrome screen cycling through Gas, Motion, and Connectivity pages |
| **Acoustic Alarm** | Active Piezo Buzzer | 2000 Hz pulse siren driven via LEDC PWM (GPIO 25) |
| **Long-Range RF** | SX1278 (Ra-02) LoRa | 433 MHz SPI packet telemetry for remote transmission |
| **Power Supply** | 5V / 2A Micro-USB | Powers ESP32, sensor heating elements, and displays |

---

## 🔌 Hardware Pinout Matrix

Based on the actual verified firmware implementation in [`hardware/anveshak_esp32_firmware/anveshak_esp32_firmware.ino`](./hardware/anveshak_esp32_firmware/anveshak_esp32_firmware.ino):

| Peripheral | ESP32 Pin | Interface / Bus | Signal Description |
| :--- | :--- | :--- | :--- |
| **MQ-2 Analog Out** | **GPIO 34** | ADC1_CH6 | 12-bit Analog Input (`analogSetPinAttenuation(ADC_11db)`) |
| **Buzzer (+)** | **GPIO 25** | LEDC PWM (Ch 0) | 2000 Hz Square Wave, 8-bit resolution |
| **MPU-6050 SDA** | **GPIO 21** | I2C (Shared Bus) | Serial Data @ 100 kHz (I2C address `0x68`) |
| **MPU-6050 SCL** | **GPIO 22** | I2C (Shared Bus) | Serial Clock @ 100 kHz |
| **SSD1306 OLED SDA**| **GPIO 21** | I2C (Shared Bus) | Display Data (I2C address `0x3C`) |
| **SSD1306 OLED SCL**| **GPIO 22** | I2C (Shared Bus) | Display Clock |
| **SX1278 LoRa SCK** | **GPIO 18** | SPI Bus | SPI Clock |
| **SX1278 LoRa MISO**| **GPIO 19** | SPI Bus | Master In Slave Out |
| **SX1278 LoRa MOSI**| **GPIO 23** | SPI Bus | Master Out Slave In |
| **SX1278 LoRa NSS** | **GPIO 05** | GPIO Output | SPI Chip Select |
| **SX1278 LoRa RST** | **GPIO 14** | GPIO Output | Module Hardware Reset |
| **SX1278 LoRa DIO0**| **GPIO 26** | GPIO Input | Packet Tx/Rx Interrupt |

---

## 💻 Software Technologies Used

### Frontend
- **React 19** (`react` & `react-dom` v19.2.8)
- **Vite 8** (`vite` v8.3.4, `@vitejs/plugin-react` v6.1.1)
- **Tailwind CSS 3** (`tailwindcss` v3.4.19, `autoprefixer`, `postcss`)
- **Recharts** (`recharts` v3.10.1) — Real-time waveform trend charts with brush zoom
- **Lucide React** (`lucide-react` v1.55.0) — Technical dashboard iconography
- **Web Audio API** — Hardware-calibrated 2000 Hz square-wave synthesizer

### Backend Microservice
- **Node.js** (ES Modules, `node:http`)
- **Express 4** (`express` v4.21.2)
- **SerialPort** (`serialport` v13.0.0, `@serialport/parser-readline`) — Auto-reconnecting USB bridge
- **Firebase Admin SDK** (`firebase-admin` v13.1.0) — Optional cloud push
- **dotenv** & **cors**

### Microcontroller Firmware
- **Arduino C / C++** on ESP-IDF core (v2.x / v3.x compatible)
- **Adafruit GFX** & **Adafruit SSD1306**
- **Sandeep Mistry LoRa** library
- **BlynkSimpleEsp32** (optional secondary sync)

---

## 📊 Features Implemented & Verified

### ✅ Working & Verified
- [x] **Real-Time USB Serial Bridge**: Automatically discovers ESP32 on `COM14` (115200 baud), parses hardware text telemetry and JSON packets, and publishes live frames to the UI every 1000 ms.
- [x] **HTTP Ingestion Endpoint**: `POST /api/ingest` accepts JSON packets from Wi-Fi-enabled edge nodes.
- [x] **Server-Sent Events (SSE)**: `GET /api/stream` streams live hardware telemetry frames directly into the browser with zero polling lag.
- [x] **Critical Threshold Alarm**: Gas threshold is set to **$\ge 1000\text{ ADC}$**. Readings $\ge 1000$ trigger the physical GPIO 25 buzzer and the 2000 Hz dashboard audio alarm.
- [x] **Virtual 0.96" OLED Mirror**: High-fidelity 128x64 display mirror in the web dashboard replicating the physical display's 3-page cyclic view.
- [x] **3D Attitude Orientation Cube**: Real-time roll/pitch attitude visualizer driven by live MPU-6050 accelerometer and gyroscope data.
- [x] **Historical Analytics & CSV Export**: Date range filtering presets (*1h*, *6h*, *24h*, *7d*, *Custom*), multi-metric waveforms, and one-click CSV dataset download.
- [x] **Device Diagnostics Screen**: Real-time MCU registers, free SRAM heap, flash memory, and peripheral health indicators.

### 🟡 Planned / Prototype Stage
- [ ] **End-to-End LoRa Gateway**: LoRa packet transmission is implemented on the edge node; remote gateway receiver station is in prototype testing.
- [ ] **Clinical Fall Detection Validation**: Fall impacts are flagged using a resultant $G$-force threshold ($\ge 2.5g$); machine-learning-based activity classification is planned.
- [ ] **Server-Side Firebase Admin Key**: Firebase RTDB synchronization operates via client credentials; dedicated service-account key injection for the Node backend is pending.

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18.0.0 or higher)
- [Arduino IDE](https://www.arduino.cc/en/software) (v2.0+) with ESP32 board support package installed
- USB-to-UART bridge drivers (CP210x or CH340, depending on your ESP32 board)

---

### 2. Microcontroller Setup (Hardware)
1. Open Arduino IDE and install the following libraries via **Library Manager**:
   - `Adafruit GFX Library`
   - `Adafruit SSD1306`
   - `LoRa` by Sandeep Mistry
   - `Blynk` by Volodymyr Shymanskyy (optional)
2. Connect your sensors according to the [Hardware Pinout Matrix](#-hardware-pinout-matrix).
3. Open [`hardware/anveshak_esp32_firmware/anveshak_esp32_firmware.ino`](./hardware/anveshak_esp32_firmware/anveshak_esp32_firmware.ino).
4. Update the Wi-Fi credentials and local IP address (or leave them default if streaming over USB):
   ```cpp
   char ssid[] = "YOUR_WIFI_SSID";
   char pass[] = "YOUR_WIFI_PASSWORD";
   #define ANVESHAK_SERVER_URL "http://YOUR_LOCAL_IP:5000/api/ingest"
   ```
5. Select **Board**: `ESP32 Dev Module`, select your active **COM Port**, and click **Upload**.

---

### 3. Backend Ingestion Microservice Setup
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   npm install
   ```
2. Copy the environment template:
   ```bash
   copy .env.example .env    # On Windows
   cp .env.example .env      # On Linux/macOS
   ```
3. Start the ingestion microservice:
   ```bash
   npm start
   ```
   *The server starts on port 5000 and automatically connects to your connected ESP32 on `COM14`.*

---

### 4. Frontend Dashboard Setup
1. In the project root directory, install frontend dependencies:
   ```bash
   npm install
   ```
2. Copy the frontend environment template:
   ```bash
   copy .env.example .env    # On Windows
   cp .env.example .env      # On Linux/macOS
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to **`http://localhost:5173/`**.

---

## 🔒 Security & Safe Publication Guidelines

- **Protected Secrets**: Never commit real `.env` files or Firebase `serviceAccountKey.json` files to Git. The repository includes an exhaustive [`.gitignore`](./.gitignore) file.
- **Sanitized Placeholders**: All sensitive strings (Wi-Fi passwords, private server IPs, auth tokens) in public files use standard placeholders (`YOUR_WIFI_SSID`, `YOUR_DEVICE_SECRET_KEY`).
- **Local Working Backups**: If you maintain private network credentials for local hardware testing, keep them in local unversioned files (e.g. `*_local.ino`).

---

## 👥 Team & Contributions

- **Lead Hardware & Firmware Engineer**: Mohd Uvais (*Prototype assembly, pinout mapping, sensor calibration*)
- **Software & Full-Stack Architect**: ANVESHAK Development Team
- **Contributors**: Open for community contributions via GitHub Pull Requests.

---

## 🔮 Future Improvements

1. **Dedicated LoRa Base Station**: Implementation of an ESP32 LoRa-to-MQTT receiver gateway for remote field deployments beyond Wi-Fi range.
2. **Predictive Gas Dispersion Modelling**: Integration of ambient temperature and humidity compensation algorithms for the MQ-2 sensor.
3. **PWA Offline Mode**: Progressive Web App service-worker caching for intermittent internet connectivity in underground facilities.

---

## ⚠️ Safety Disclaimer

> [!WARNING]
> **ANVESHAK IS AN ACADEMIC / INDUSTRIAL PROTOTYPE AND RESEARCH DEMONSTRATOR.**
>
> It is **NOT** a certified life-safety device and has not been evaluated under ATEX, IECEx, UL 2075, or EN 50291 industrial safety standards. It must **not** be used as a primary life-safety alarm in hazardous, combustible, or oxygen-deficient environments. Always use certified, commercially approved safety instrumentation for hazardous operations.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](./LICENSE) file for details.
