/**
 * Jaalee JHT Parser for Shelly BLU Gateway with MQTT Home Assistant Integration
 * Parses iBeacon-format temperature and humidity data from Jaalee JHT sensors
 * and publishes to Home Assistant via MQTT Auto-Discovery
 *
 * Version: 1.1
 * Repository: https://github.com/arboeh/jaalee-shelly-mqtt
 */

/******************* LOGGING SYSTEM *******************/
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Logger configuration
const LOGGER = {
  level: LOG_LEVELS.INFO, // Will be set from CONFIG

  error: function (message) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.log("[ERROR]", message);
    }
  },

  warn: function (message) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.log("[WARN]", message);
    }
  },

  info: function (message) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log("[INFO]", message);
    }
  },

  debug: function (message) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log("[DEBUG]", message);
    }
  }
};
/******************* END LOGGING *******************/

/******************* CONFIGURATION *******************/
const CONFIG = {
  eventName: "jaalee-jht",
  active: true, // Active scan required for Jaalee devices

  // Log levels: ERROR=0, WARN=1, INFO=2, DEBUG=3
  // INFO: Shows important events (sensor found, MQTT status, etc.)
  // DEBUG: Shows all BLE scans and detailed information
  logLevel: LOG_LEVELS.INFO,

  mqtt: {
    enabled: true,
    discovery_prefix: "homeassistant", // Standard HA Discovery Prefix
    device_prefix: "jaalee", // Prefix for MQTT topics
    publish_rssi: true, // Optional: Publish RSSI sensor (set to false to disable)
    publish_last_seen: true // Optional: Publish last_seen timestamp (set to false to disable)
  },
  knownDevices: {
    // Optional: Format: "mac-address": "friendly_name"
    // Examples:
    // "aa:bb:cc:dd:ee:ff": "Living Room",
    // "11:22:33:44:55:66": "Bedroom"
  }
};

// Apply log level from config
LOGGER.level = CONFIG.logLevel;
/******************* END CONFIGURATION *******************/

// Jaalee-specific constants
const IBEACON_PREFIX = [0xFF, 0x4C, 0x00];
const JAALEE_UUID_MARKER = [0xF5, 0x25];

// Tracking for Discovery (publish only once per device)
let discoveredDevices = {};

// Helper: MAC address formatting for topics (no RegEx, Shelly mJS compatible)
function formatMacForTopic(mac) {
  if (!mac)
    return "";

  const parts = mac.split(':');
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    result += parts[i].toLowerCase();
  }
  return result;
}

// Helper: Get current timestamp in ISO format (UTC)
function getTimestamp() {
  const now = new Date();

  // Use built-in ISO string (always UTC)
  // Format: 2025-11-17T07:42:15.123Z
  return now.toISOString();
}

// MQTT Discovery for Home Assistant
function publishDiscovery(mac, friendlyName) {
  if (!MQTT.isConnected()) {
    LOGGER.warn("MQTT not connected, skipping discovery");
    return;
  }

  const macClean = formatMacForTopic(mac);
  const deviceId = CONFIG.mqtt.device_prefix + "_" + macClean;
  const deviceName = friendlyName || ("Jaalee JHT " + mac);

  // Device Info (shared by all entities)
  const deviceInfo = Shelly.getDeviceInfo();
  const device = {
    identifiers: [deviceId],
    name: deviceName,
    model: "Jaalee JHT",
    manufacturer: "Jaalee",
    via_device: deviceInfo.id
  };

  // Temperature Sensor Discovery
  const tempConfig = {
    name: "Temperature",
    unique_id: deviceId + "_temperature",
    state_topic: CONFIG.mqtt.device_prefix + "/" + macClean + "/state",
    value_template: "{{ value_json.temperature }}",
    unit_of_measurement: "°C",
    device_class: "temperature",
    state_class: "measurement",
    device: device
  };

  MQTT.publish(
    CONFIG.mqtt.discovery_prefix + "/sensor/" + deviceId + "_temperature/config",
    JSON.stringify(tempConfig),
    0,
    true);

  // Humidity Sensor Discovery
  const humiConfig = {
    name: "Humidity",
    unique_id: deviceId + "_humidity",
    state_topic: CONFIG.mqtt.device_prefix + "/" + macClean + "/state",
    value_template: "{{ value_json.humidity }}",
    unit_of_measurement: "%",
    device_class: "humidity",
    state_class: "measurement",
    device: device
  };

  MQTT.publish(
    CONFIG.mqtt.discovery_prefix + "/sensor/" + deviceId + "_humidity/config",
    JSON.stringify(humiConfig),
    0,
    true);

  // Battery Sensor Discovery
  const battConfig = {
    name: "Battery",
    unique_id: deviceId + "_battery",
    state_topic: CONFIG.mqtt.device_prefix + "/" + macClean + "/state",
    value_template: "{{ value_json.battery }}",
    unit_of_measurement: "%",
    device_class: "battery",
    state_class: "measurement",
    device: device
  };

  MQTT.publish(
    CONFIG.mqtt.discovery_prefix + "/sensor/" + deviceId + "_battery/config",
    JSON.stringify(battConfig),
    0,
    true);

  // RSSI Sensor Discovery (optional, disabled by default in HA)
  if (CONFIG.mqtt.publish_rssi) {
    const rssiConfig = {
      name: "Signal Strength",
      unique_id: deviceId + "_rssi",
      state_topic: CONFIG.mqtt.device_prefix + "/" + macClean + "/state",
      value_template: "{{ value_json.rssi }}",
      unit_of_measurement: "dBm",
      device_class: "signal_strength",
      state_class: "measurement",
      entity_category: "diagnostic",
      enabled_by_default: false,
      device: device
    };

    MQTT.publish(
      CONFIG.mqtt.discovery_prefix + "/sensor/" + deviceId + "_rssi/config",
      JSON.stringify(rssiConfig),
      0,
      true);
  }

  // Last Seen Sensor Discovery (optional, disabled by default in HA)
  if (CONFIG.mqtt.publish_last_seen) {
    const lastSeenConfig = {
      name: "Last Seen",
      unique_id: deviceId + "_last_seen",
      state_topic: CONFIG.mqtt.device_prefix + "/" + macClean + "/state",
      value_template: "{{ value_json.last_seen }}",
      device_class: "timestamp",
      entity_category: "diagnostic",
      enabled_by_default: false,
      device: device
    };

    MQTT.publish(
      CONFIG.mqtt.discovery_prefix + "/sensor/" + deviceId + "_last_seen/config",
      JSON.stringify(lastSeenConfig),
      0,
      true);
  }

  LOGGER.info("MQTT Discovery published for: " + mac);
}

// Publish Sensor Data to MQTT
function publishSensorData(mac, data) {
  if (!MQTT.isConnected()) {
    LOGGER.warn("MQTT not connected, skipping publish");
    return;
  }

  const macClean = formatMacForTopic(mac);
  const stateTopic = CONFIG.mqtt.device_prefix + "/" + macClean + "/state";

  // Build payload with mandatory fields
  const payload = {
    temperature: data.temperature,
    humidity: data.humidity,
    battery: data.battery
  };

  // Add optional fields based on configuration
  if (CONFIG.mqtt.publish_rssi) {
    payload.rssi = data.rssi;
  }

  if (CONFIG.mqtt.publish_last_seen) {
    payload.last_seen = getTimestamp();
  }

  MQTT.publish(stateTopic, JSON.stringify(payload), 0, false);
  LOGGER.debug("Published sensor data to: " + stateTopic);
}

// Emit parsed data
function emitJaaleeData(data) {
  if (typeof data !== "object")
    return;

  // Emit event for local use
  Shelly.emitEvent(CONFIG.eventName, data);

  // MQTT Publishing
  if (CONFIG.mqtt.enabled && data.address) {
    const friendlyName = CONFIG.knownDevices[data.address] || null;

    // Publish discovery once per device
    if (!discoveredDevices[data.address]) {
      publishDiscovery(data.address, friendlyName);
      discoveredDevices[data.address] = true;
    }

    // Publish sensor data
    publishSensorData(data.address, data);
  }
}

// Jaalee Decoder with corrected iBeacon parsing
const JaaleeDecoder = {
  // Convert buffer to hex string for debugging
  bufferToHex: function (buffer) {
    let hex = '';
    for (let i = 0; i < buffer.length; i++) {
      hex += ('0' + buffer.at(i).toString(16)).slice(-2);
    }
    return hex;
  },

  // Extract 16-bit unsigned integer (big-endian)
  getUInt16BE: function (buffer, offset) {
    return (buffer.at(offset) << 8) | buffer.at(offset + 1);
  },

  // Parse iBeacon format (24 bytes from manufacturer_data)
  parseLongFormat: function (data) {
    if (data.length !== 24)
      return null;

    // Check for iBeacon header (0x02 0x15)
    if (data.at(0) !== 0x02 || data.at(1) !== 0x15) {
      return null;
    }

    // Jaalee UUID Check: Search for F5 25 anywhere in UUID (bytes 2-17)
    // Different firmware versions place the marker at different positions
    let hasJaaleeMarker = false;
    for (let i = 2; i < 17; i++) {
      if (data.at(i) === 0xF5 && data.at(i + 1) === 0x25) {
        hasJaaleeMarker = true;
        break;
      }
    }

    if (!hasJaaleeMarker) {
      // No Jaalee marker found - skip this device
      return null;
    }

    // Extract temperature (bytes 18-19, big-endian)
    const tempRaw = this.getUInt16BE(data, 18);
    const temperature = Math.round((175 * tempRaw / 65535 - 45) * 100) / 100;

    // Extract humidity (bytes 20-21, big-endian)
    const humiRaw = this.getUInt16BE(data, 20);
    const humidity = Math.round((100 * humiRaw / 65535) * 100) / 100;

    // Extract battery (byte 23)
    const battery = data.at(23);

    // Plausibility check for sensor values
    if (temperature < -40 || temperature > 80 || humidity < 0 || humidity > 100) {
      return null;
    }

    return {
      temperature: temperature,
      humidity: humidity,
      battery: battery,
      format: "iBeacon-24"
    };
  },

  // Parse short format (15-16 bytes)
  parseShortFormat: function (data, expectedMac) {
    if (data.length < 15 || data.length > 16)
      return null;

    // Extract battery (byte 4)
    const battery = data.at(4);

    // Extract MAC address (bytes 5-10, reversed)
    const macReversed = [];
    for (let i = 5; i < 11; i++) {
      macReversed.push(data.at(i));
    }
    const macAddress = macReversed.reverse();

    // Verify MAC address if provided
    if (expectedMac && expectedMac.length === 6) {
      let macMatch = true;
      for (let i = 0; i < 6; i++) {
        if (macAddress[i] !== expectedMac[i]) {
          macMatch = false;
          break;
        }
      }
      if (!macMatch) {
        LOGGER.debug("Jaalee: MAC address mismatch");
        return null;
      }
    }

    // Extract temperature (last 4 bytes: -4 to -2, big-endian)
    const tempRaw = this.getUInt16BE(data, data.length - 4);
    const temperature = Math.round((175 * tempRaw / 65535 - 45) * 100) / 100;

    // Extract humidity (last 2 bytes, big-endian)
    const humiRaw = this.getUInt16BE(data, data.length - 2);
    const humidity = Math.round((100 * humiRaw / 65535) * 100) / 100;

    // Plausibility check
    if (temperature < -40 || temperature > 80 || humidity < 0 || humidity > 100) {
      return null;
    }

    return {
      temperature: temperature,
      humidity: humidity,
      battery: battery,
      format: "short"
    };
  },

  // Main parsing function
  parse: function (advData, macAddress) {
    if (!advData || advData.length === 0)
      return null;

    // Try iBeacon format first (24 bytes)
    let result = this.parseLongFormat(advData);
    if (result) {
      return result;
    }

    // Try short format (15-16 bytes)
    result = this.parseShortFormat(advData, macAddress);
    if (result) {
      return result;
    }

    return null;
  }
};

// BLE Scan Callback for Jaalee devices
function JaaleeScanCallback(event, result) {
  if (event !== BLE.Scanner.SCAN_RESULT)
    return;

  // Check if we have manufacturer data
  let advData = null;

  if (typeof result.manufacturer_data !== "undefined") {
    for (let key in result.manufacturer_data) {
      advData = result.manufacturer_data[key];
      break;
    }
  }

  if (!advData)
    return;

  // Debug: Show all BLE devices
  LOGGER.debug("BLE Device: " + result.addr + " RSSI: " + result.rssi + " Data length: " + advData.length);

  // Convert MAC address string to byte array
  let macBytes = null;
  if (result.addr) {
    const macParts = result.addr.split(':');
    if (macParts.length === 6) {
      macBytes = [];
      for (let i = 0; i < macParts.length; i++) {
        macBytes.push(parseInt(macParts[i], 16));
      }
    }
  }

  // Parse the Jaalee data
  const parsed = JaaleeDecoder.parse(advData, macBytes);

  if (parsed) {
    parsed.rssi = result.rssi;
    parsed.address = result.addr;
    parsed.model = "Jaalee JHT";

    // Info: Found Jaalee sensor
    LOGGER.info("Jaalee JHT found - MAC: " + result.addr +
      " | Temp: " + parsed.temperature + "°C" +
      " | Humidity: " + parsed.humidity + "%");

    // Debug: Detailed information
    LOGGER.debug("Battery: " + parsed.battery + "% | " +
      "RSSI: " + parsed.rssi + "dBm | " +
      "Format: " + parsed.format);

    emitJaaleeData(parsed);
  }
}

// Initialize the Jaalee parser
function init() {
  if (typeof CONFIG === "undefined") {
    LOGGER.error("Undefined config");
    return;
  }

  // Check if Bluetooth is enabled
  const BLEConfig = Shelly.getComponentConfig("ble");
  if (!BLEConfig.enable) {
    LOGGER.error("Bluetooth is not enabled");
    return;
  }

  // Check MQTT connection if MQTT is enabled
  if (CONFIG.mqtt.enabled) {
    if (MQTT.isConnected()) {
      LOGGER.info("MQTT connected");
    } else {
      LOGGER.warn("MQTT not connected - check MQTT settings");
    }
  }

  // Start BLE Scanner
  if (BLE.Scanner.isRunning()) {
    LOGGER.info("BLE scanner already running");
  } else {
    const bleScanner = BLE.Scanner.Start({
      duration_ms: BLE.Scanner.INFINITE_SCAN,
      active: CONFIG.active
    });

    if (!bleScanner) {
      LOGGER.error("Cannot start BLE scanner");
      return;
    }
  }

  BLE.Scanner.Subscribe(JaaleeScanCallback);

  // Show startup info
  const levelName = LOGGER.level === LOG_LEVELS.DEBUG ? "DEBUG" :
    LOGGER.level === LOG_LEVELS.INFO ? "INFO" :
    LOGGER.level === LOG_LEVELS.WARN ? "WARN" : "ERROR";

  LOGGER.info("Jaalee JHT parser initialized (v1.1)");
  LOGGER.info("Log level: " + levelName);
  LOGGER.info("Optional sensors - RSSI: " + CONFIG.mqtt.publish_rssi +
    ", Last Seen: " + CONFIG.mqtt.publish_last_seen);
}

// Start the script
init();
