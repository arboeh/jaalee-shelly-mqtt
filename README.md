# jaABlu

## Jaalee JHT BLE → Home Assistant via Shelly BLU Gateway & MQTT

#### 🌐 [🇩🇪 Deutsche Version](README.de.md) | [🇬🇧 English](README.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Home Assistant](https://img.shields.io/badge/Home%20Assistant-Compatible-41BDF5.svg)](https://www.home-assistant.io/)
[![Shelly](https://img.shields.io/badge/Shelly-BLU%20Gateway-00A0E3.svg)](https://shelly.cloud/)
[![Version](https://img.shields.io/github/v/release/arboeh/jaABlu?color=brightgreen)](https://github.com/arboeh/jaABlu/releases/latest)

This script reads **Jaalee JHT** BLE temperature and humidity sensors using **Shelly BLU Gateway** devices as Bluetooth proxies and forwards the data to **Home Assistant** via **MQTT Auto-Discovery**.

## Features

- ✅ **Full MQTT Auto-Discovery support** – sensors are created automatically in Home Assistant
- ✅ **5 sensor entities per device**: Temperature, Humidity, Battery, RSSI, Last Seen
- ✅ **Online/Offline status** – automatic detection via configurable timeout (default 5 minutes)
- ✅ **Multi-sensor support** – any number of Jaalee JHT sensors per Shelly BLU Gateway
- ✅ **Configurable logging** – DEBUG / INFO / WARN / ERROR
- ✅ **Active BLE scanning** – optimized for the Jaalee iBeacon format

## Requirements

- Shelly BLU Gateway (e.g. BLU Gateway, BLU Mini, BLU Pro) with **Bluetooth enabled**
- Home Assistant with a running **MQTT broker** (e.g. Mosquitto)
- MQTT Auto-Discovery enabled, Discovery prefix set to `homeassistant` (default)

## Installation

1. **Upload the script to your Shelly BLU Gateway**

   In the web UI:
   - `Settings → Scripts → Add script`
   - Paste the contents of `jaalee-parser.js`
   - Enable the script

2. **Enable Bluetooth on the Shelly**
   - `Settings → Bluetooth → Enable`

3. **Start the script**
   - `Settings → Scripts → jaalee-parser.js → Start`
   - Optionally enable autostart for the script

4. **Verify in Home Assistant**
   - After a few seconds, new devices should appear under  
     `Settings → Devices & Services → MQTT`.
   - Each Jaalee sensor will expose several entities (Temperature, Humidity, Battery, etc.).

## Configuration

The script can be configured through the `CONFIG` object:

    const CONFIG = {
        mqtt: {
            publish_rssi: true, // Signal strength (dBm) as diagnostic entity
            publish_last_seen: true, // Last seen timestamp (ISO 8601)
            sensor_timeout: 300 // Seconds without update -> offline (default: 5 minutes)
        },
        knownDevices: {
            "aa:bb:cc:dd:ee:ff": "Living Room" // Optional friendly names by MAC
        }
    };

## Home Assistant Entities

| Entity                          | Type   | Device Class      | Default |
| ------------------------------- | ------ | ----------------- | ------- |
| `sensor.jaalee_xxx_temperature` | Sensor | `temperature`     | ✅      |
| `sensor.jaalee_xxx_humidity`    | Sensor | `humidity`        | ✅      |
| `sensor.jaalee_xxx_battery`     | Sensor | `battery`         | ✅      |
| `sensor.jaalee_xxx_rssi`        | Sensor | `signal_strength` | 🔘      |
| `sensor.jaalee_xxx_last_seen`   | Sensor | `timestamp`       | 🔘      |

## Troubleshooting

**❌ No sensors/devices appear in Home Assistant**

- Restart Home Assistant once after the script has been started.
- Verify that the MQTT broker is configured correctly in Home Assistant.
- Check the script logs for messages like "MQTT connected" and "MQTT Discovery published for: …".

**❌ Discovery topics missing on the MQTT broker**

- Increase log level to DEBUG in the script:

        logLevel: LOG_LEVELS.DEBUG

- Use an MQTT tool (e.g. MQTT Explorer) to check for topics like

        `homeassistant/sensor/jaalee_*/config`.

## Logs (DEBUG mode)

    [INFO] Jaalee JHT parser initialized (v1.2.1)
    [INFO] MQTT connected
    [INFO] Jaalee JHT found - MAC: c5:c7:14:4d:2b:35 | Temp: 21.5°C | Humidity: 52%
    [INFO] MQTT Discovery published for: c5:c7:14:4d:2b:35
    [WARN] Sensor timeout: c5:c7:14:4d:2b:35 (no data for 305s)

## License

MIT License – see [LICENSE](LICENSE) © 2026 Arend Böhmer.

## Repository

[https://github.com/arboeh/jaABlu](https://github.com/arboeh/jaABlu)
