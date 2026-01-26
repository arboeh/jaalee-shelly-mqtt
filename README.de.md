# jaABlu

## Jaalee JHT BLE → Home Assistant via Shelly BLU Gateway & MQTT

#### 🌐 [🇬🇪 Deutsche Version](README.de.md) | [🇬🇧 English Version](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Compatible-41BDF5.svg)](https://www.home-assistant.io/)
[![Shelly](https://img.shields.io/badge/Shelly-BLU%20Gateway-00A0E3.svg)](https://shelly.cloud/)
[![Version](https://img.shields.io/github/v/release/arboeh/jaABlu?color=brightgreen)](https://github.com/arboeh/jaABlu/releases/latest)

Dieses Script liest **Jaalee JHT** BLE Temperatur-/Feuchtigkeitssensoren über **Shelly BLU Gateway** Geräte (als Bluetooth-Proxy) aus und übermittelt die Daten per **MQTT Auto-Discovery** automatisch an **Home Assistant**.

## Features

- ✅ **Volle MQTT Auto-Discovery-Unterstützung** – Sensoren erscheinen automatisch in Home Assistant
- ✅ **5 Sensor-Entities pro Gerät**: Temperature, Humidity, Battery, RSSI, Last Seen
- ✅ **Online-/Offline-Status** – automatische Erkennung nach konfigurierbarem Timeout (Standard 5 Minuten)
- ✅ **Multi-Sensor-Support** – beliebig viele Jaalee JHT pro Shelly BLU Gateway
- ✅ **Konfigurierbares Logging** – DEBUG / INFO / WARN / ERROR
- ✅ **Aktives BLE-Scanning** – optimiert für das Jaalee iBeacon-Format

## Voraussetzungen

- Shelly BLU Gateway (z.B. BLU Gateway, BLU Mini, BLU Pro) mit **aktiviertem Bluetooth**
- Home Assistant mit laufendem **MQTT Broker** (z.B. Mosquitto)
- MQTT Auto-Discovery aktiviert, Discovery Prefix: `homeassistant` (Standardwert)

## Installation

1. **Script auf das Shelly BLU Gateway hochladen**

   Im Webinterface:
   - `Settings → Scripts → Add script`
   - Inhalt von `jaalee-parser.js` einfügen
   - Script aktivieren (Enable)

2. **Bluetooth auf dem Shelly aktivieren**
   - `Settings → Bluetooth → Enable`

3. **Script starten**
   - `Settings → Scripts → jaalee-parser.js → Start`
   - Optional: Autostart aktivieren

4. **Home Assistant prüfen**
   - Nach wenigen Sekunden sollten die neuen Geräte unter  
     `Einstellungen → Geräte & Dienste → MQTT` auftauchen.
   - Pro Sensor werden mehrere Entities (Temperature, Humidity, Battery, etc.) angelegt.

## Konfiguration

Im Script kann die Konfiguration über das `CONFIG`-Objekt angepasst werden:

    const CONFIG = {
        mqtt: {
            publish_rssi: true, // Signalstärke (dBm) als Diagnose-Entity
            publish_last_seen: true, // Letzter Empfangszeitpunkt (ISO 8601)
            sensor_timeout: 300 // Sekunden ohne Update -> offline (Standard: 5 Minuten)
        },
        knownDevices: {
            "aa:bb:cc:dd:ee:ff": "Wohnzimmer" // Optionale Friendly Names pro MAC
        }
    };

## Home Assistant Entities

| Entity                          | Typ    | Device Class      | Standard |
| ------------------------------- | ------ | ----------------- | -------- |
| `sensor.jaalee_xxx_temperature` | Sensor | `temperature`     | ✅       |
| `sensor.jaalee_xxx_humidity`    | Sensor | `humidity`        | ✅       |
| `sensor.jaalee_xxx_battery`     | Sensor | `battery`         | ✅       |
| `sensor.jaalee_xxx_rssi`        | Sensor | `signal_strength` | 🔘       |
| `sensor.jaalee_xxx_last_seen`   | Sensor | `timestamp`       | 🔘       |

## Troubleshooting

**❌ Keine Sensoren / Geräte in Home Assistant sichtbar?**

- Home Assistant nach dem ersten Start des Scripts einmal neu starten.
- Prüfen, ob der MQTT Broker in Home Assistant korrekt konfiguriert ist.
- Im Log des Scripts nachsehen, ob „MQTT connected" und „MQTT Discovery published for: …" erscheint.

**❌ Discovery-Topics fehlen auf dem Broker?**

- Log-Level im Script auf DEBUG erhöhen:

        logLevel: LOG_LEVELS.DEBUG

- Mit einem MQTT-Tool (z.B. MQTT Explorer) prüfen, ob Topics wie

        `homeassistant/sensor/jaalee_*/config` vorhanden sind.

## Logs (DEBUG Mode)

    [INFO] Jaalee JHT parser initialized (v1.2.1)
    [INFO] MQTT connected
    [INFO] Jaalee JHT found - MAC: c5:c7:14:4d:2b:35 | Temp: 21.5°C | Humidity: 52%
    [INFO] MQTT Discovery published for: c5:c7:14:4d:2b:35
    [WARN] Sensor timeout: c5:c7:14:4d:2b:35 (no data for 305s)

## Lizenz

MIT License – siehe [LICENSE](LICENSE) © 2026 Arend Böhmer

## Repository

[https://github.com/arboeh/jaABlu](https://github.com/arboeh/jaABlu)
