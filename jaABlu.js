/**
 * jaABlu | Jaalee JHT Parser for Shelly BLU Gateway with MQTT Home Assistant Integration
 *
 * Parses iBeacon-format temperature and humidity data from Jaalee JHT sensors
 * and publishes to Home Assistant via MQTT Auto-Discovery.
 *
 * @version     1.3.0
 * @date        2026-01-27
 * @author      arboeh
 * @license     MIT License
 * @repository  [https://github.com/arboeh/jaABlu](https://github.com/arboeh/jaABlu)
 */

/******************* VERSION *******************/
const VERSION = '1.3.0';
/******************* END VERSION *******************/

/******************* LOGGING SYSTEM *******************/
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

// Logger configuration
const LOGGER = {
  level: LOG_LEVELS.INFO, // Will be set from CONFIG

  error: function (message) {
    if (this.level >= LOG_LEVELS.ERROR) {
      console.log('[ERROR] jaABlu v' + VERSION + ':', message);
    }
  },

  warn: function (message) {
    if (this.level >= LOG_LEVELS.WARN) {
      console.log('[WARN] jaABlu v' + VERSION + ':', message);
    }
  },

  info: function (message) {
    if (this.level >= LOG_LEVELS.INFO) {
      console.log('[INFO] jaABlu v' + VERSION + ':', message);
    }
  },

  debug: function (message) {
    if (this.level >= LOG_LEVELS.DEBUG) {
      console.log('[DEBUG] jaABlu v' + VERSION + ':', message);
    }
  },
};
/******************* END LOGGING *******************/

/******************* CONFIGURATION *******************/
const CONFIG = {
  eventName: 'jaalee-jht',
  active: true, // Active scan required for Jaalee devices

  // Log levels: ERROR=0, WARN=1, INFO=2, DEBUG=3
  // INFO: Shows important events (sensor found, MQTT status, etc.)
  // DEBUG: Shows all BLE scans and detailed information
  logLevel: LOG_LEVELS.INFO,

  // Temperature unit configuration
  temperature: {
    unit: 'celsius', // 'celsius' or 'fahrenheit'
  },

  mqtt: {
    enabled: true,
    discovery_prefix: 'homeassistant', // Standard HA Discovery Prefix
    device_prefix: 'jaABlu', // Prefix for MQTT topics

    // Optional diagnostic sensors (disabled by default, user must enable)
    publish_rssi: true, // Signal strength (RSSI in dBm)
    publish_last_seen: true, // Last seen timestamp (for timeout monitoring)

    // Additional optional sensors
    publish_link_quality: false, // Link quality in % (0-100)
    publish_battery_low: false, // Binary sensor for low battery warning
    publish_data_age: false, // Age of last data in seconds

    // Status & Timeout
    sensor_timeout: 300, // Seconds without update -> offline (5 min)
    timeout_check_interval: 120, // Check interval in seconds (2 min)
    battery_low_threshold: 20, // Battery percentage threshold for low battery warning
  },

  knownDevices: {
    // Optional: Format: "mac-address": "friendly_name"
    'XX:XX:XX:XX:XX:XX': 'Jaalee JHT Kitchen',
  },
};

// Apply log level from config
LOGGER.level = CONFIG.logLevel;
/******************* END CONFIGURATION *******************/

/******************* CONSTANTS *******************/
// Jaalee-specific constants
const IBEACON_PREFIX = [0xff, 0x4c, 0x00];
const JAALEE_UUID_MARKER = [0xf5, 0x25];

// Sensor calculation constants
const TEMP_SCALE_FACTOR = 175;
const TEMP_OFFSET = -45;
const HUMIDITY_SCALE_FACTOR = 100;
const ADC_MAX_VALUE = 65535;

// Sensor validation ranges
const TEMP_MIN = -40;
const TEMP_MAX = 80;
const HUMIDITY_MIN = 0;
const HUMIDITY_MAX = 100;

// RSSI to Link Quality conversion
const RSSI_EXCELLENT = -30; // 100% quality
const RSSI_UNUSABLE = -90; // 0% quality
/******************* END CONSTANTS *******************/

// Tracking for Discovery (publish only once per device)
let discoveredDevices = {};
let lastSeenTimestamps = {};
let lastDataTimestamps = {}; // Track data age
let mqttConnected = false;

/******************* HELPER FUNCTIONS *******************/
// Round to 2 decimal places
function roundTo2Decimals(value) {
  return Math.round(value * 100) / 100;
}

// Convert temperature based on configuration
function convertTemperature(celsius) {
  if (CONFIG.temperature.unit === 'fahrenheit') {
    return roundTo2Decimals((celsius * 9) / 5 + 32);
  }
  return celsius;
}

// Get temperature unit symbol
function getTemperatureUnit() {
  return CONFIG.temperature.unit === 'fahrenheit' ? '°F' : '°C';
}

// Validate sensor data plausibility
function validateSensorData(temperature, humidity) {
  if (temperature < TEMP_MIN || temperature > TEMP_MAX) {
    return false;
  }
  if (humidity < HUMIDITY_MIN || humidity > HUMIDITY_MAX) {
    return false;
  }
  return true;
}

// Calculate Link Quality from RSSI (0-100%)
function calculateLinkQuality(rssi) {
  // Linear mapping: -30 dBm = 100%, -90 dBm = 0%
  const range = RSSI_EXCELLENT - RSSI_UNUSABLE;
  const quality = ((rssi - RSSI_UNUSABLE) * 100) / range;
  return Math.round(Math.min(100, Math.max(0, quality)));
}

// Check if battery is low
function isBatteryLow(battery) {
  return battery <= CONFIG.mqtt.battery_low_threshold;
}

// Calculate data age in seconds
function getDataAge(mac) {
  if (!lastDataTimestamps[mac]) return 0;
  return getUnixTimestamp() - lastDataTimestamps[mac];
}

// MAC address formatting for topics (no RegEx, Shelly mJS compatible)
function formatMacForTopic(mac) {
  if (!mac) return '';

  const parts = mac.split(':');
  let result = '';
  for (let i = 0; i < parts.length; i++) {
    result += parts[i].toLowerCase();
  }
  return result;
}

// Get current timestamp in ISO format (UTC)
function getTimestamp() {
  return new Date().toISOString();
}

// Get Unix timestamp in seconds
function getUnixTimestamp() {
  return Math.floor(Date.now() / 1000);
}
/******************* END HELPER FUNCTIONS *******************/

/******************* MQTT FUNCTIONS *******************/
// Publish device status (online/offline)
function publishStatus(mac, status) {
  if (!mqttConnected) return;

  const macClean = formatMacForTopic(mac);
  const statusTopic = CONFIG.mqtt.device_prefix + '/' + macClean + '/status';

  MQTT.publish(statusTopic, status, 0, true); // retained
  LOGGER.debug("Status '" + status + "' published for: " + mac);
}

// Create device info object (reusable for all entities)
function createDeviceInfo(deviceId, deviceName) {
  const shellyInfo = Shelly.getDeviceInfo();
  return {
    identifiers: [deviceId],
    name: deviceName,
    model: 'Jaalee JHT',
    manufacturer: 'Jaalee',
    sw_version: VERSION,
    via_device: shellyInfo.id,
  };
}

// Create sensor config for MQTT Discovery
function createSensorConfig(deviceId, sensorType, device, macClean, availabilityTopic) {
  const configs = {
    temperature: {
      name: 'Temperature',
      unique_id: deviceId + '_temperature',
      value_template: '{{ value_json.temperature }}',
      unit_of_measurement: getTemperatureUnit(),
      device_class: 'temperature',
      state_class: 'measurement',
      enabled_by_default: true,
    },
    humidity: {
      name: 'Humidity',
      unique_id: deviceId + '_humidity',
      value_template: '{{ value_json.humidity }}',
      unit_of_measurement: '%',
      device_class: 'humidity',
      state_class: 'measurement',
      enabled_by_default: true,
    },
    battery: {
      name: 'Battery',
      unique_id: deviceId + '_battery',
      value_template: '{{ value_json.battery }}',
      unit_of_measurement: '%',
      device_class: 'battery',
      state_class: 'measurement',
      entity_category: 'diagnostic',
      enabled_by_default: true,
    },
    rssi: {
      name: 'Signal Strength',
      unique_id: deviceId + '_rssi',
      value_template: '{{ value_json.rssi }}',
      unit_of_measurement: 'dBm',
      device_class: 'signal_strength',
      state_class: 'measurement',
      entity_category: 'diagnostic',
      enabled_by_default: false,
    },
    last_seen: {
      name: 'Last Seen',
      unique_id: deviceId + '_last_seen',
      value_template: '{{ value_json.last_seen }}',
      device_class: 'timestamp',
      entity_category: 'diagnostic',
      enabled_by_default: false,
    },
    link_quality: {
      name: 'Link Quality',
      unique_id: deviceId + '_link_quality',
      value_template: '{{ value_json.link_quality }}',
      unit_of_measurement: '%',
      icon: 'mdi:wifi',
      state_class: 'measurement',
      entity_category: 'diagnostic',
      enabled_by_default: false,
    },
    data_age: {
      name: 'Data Age',
      unique_id: deviceId + '_data_age',
      value_template: '{{ value_json.data_age }}',
      unit_of_measurement: 's',
      icon: 'mdi:clock-outline',
      state_class: 'measurement',
      entity_category: 'diagnostic',
      enabled_by_default: false,
    },
  };

  const config = configs[sensorType];
  if (!config) return null;

  // Add common properties
  config.state_topic = CONFIG.mqtt.device_prefix + '/' + macClean + '/state';
  config.availability_topic = availabilityTopic;
  config.payload_available = 'online';
  config.payload_not_available = 'offline';
  config.device = device;

  return config;
}

// Create binary sensor config for MQTT Discovery
function createBinarySensorConfig(deviceId, sensorType, device, macClean, availabilityTopic) {
  const configs = {
    battery_low: {
      name: 'Battery Low',
      unique_id: deviceId + '_battery_low',
      state_topic: CONFIG.mqtt.device_prefix + '/' + macClean + '/state',
      value_template: '{{ value_json.battery_low }}',
      payload_on: 'ON',
      payload_off: 'OFF',
      device_class: 'battery',
      entity_category: 'diagnostic',
      enabled_by_default: false,
    },
  };

  const config = configs[sensorType];
  if (!config) return null;

  // Add common properties
  config.availability_topic = availabilityTopic;
  config.payload_available = 'online';
  config.payload_not_available = 'offline';
  config.device = device;

  return config;
}

// MQTT Discovery for Home Assistant
function publishDiscovery(mac, friendlyName) {
  if (!mqttConnected) {
    LOGGER.warn('MQTT not connected, skipping discovery');
    return;
  }

  const macClean = formatMacForTopic(mac);
  const deviceId = CONFIG.mqtt.device_prefix + '_' + macClean;
  const deviceName = friendlyName || 'Jaalee JHT ' + mac;
  const availabilityTopic = CONFIG.mqtt.device_prefix + '/' + macClean + '/status';

  // Create device info (reused for all sensors)
  const device = createDeviceInfo(deviceId, deviceName);

  // Publish primary sensors (always enabled)
  const primarySensors = ['temperature', 'humidity', 'battery'];
  for (let i = 0; i < primarySensors.length; i++) {
    const sensorType = primarySensors[i];
    const config = createSensorConfig(deviceId, sensorType, device, macClean, availabilityTopic);

    const discoveryTopic = CONFIG.mqtt.discovery_prefix + '/sensor/' + deviceId + '_' + sensorType + '/config';
    MQTT.publish(discoveryTopic, JSON.stringify(config), 0, true);
  }

  // Publish optional diagnostic sensors
  if (CONFIG.mqtt.publish_rssi) {
    const rssiConfig = createSensorConfig(deviceId, 'rssi', device, macClean, availabilityTopic);
    const discoveryTopic = CONFIG.mqtt.discovery_prefix + '/sensor/' + deviceId + '_rssi/config';
    MQTT.publish(discoveryTopic, JSON.stringify(rssiConfig), 0, true);
  }

  if (CONFIG.mqtt.publish_last_seen) {
    const lastSeenConfig = createSensorConfig(deviceId, 'last_seen', device, macClean, availabilityTopic);
    const discoveryTopic = CONFIG.mqtt.discovery_prefix + '/sensor/' + deviceId + '_last_seen/config';
    MQTT.publish(discoveryTopic, JSON.stringify(lastSeenConfig), 0, true);
  }

  if (CONFIG.mqtt.publish_link_quality) {
    const linkQualityConfig = createSensorConfig(deviceId, 'link_quality', device, macClean, availabilityTopic);
    const discoveryTopic = CONFIG.mqtt.discovery_prefix + '/sensor/' + deviceId + '_link_quality/config';
    MQTT.publish(discoveryTopic, JSON.stringify(linkQualityConfig), 0, true);
  }

  if (CONFIG.mqtt.publish_data_age) {
    const dataAgeConfig = createSensorConfig(deviceId, 'data_age', device, macClean, availabilityTopic);
    const discoveryTopic = CONFIG.mqtt.discovery_prefix + '/sensor/' + deviceId + '_data_age/config';
    MQTT.publish(discoveryTopic, JSON.stringify(dataAgeConfig), 0, true);
  }

  // Publish binary sensors
  if (CONFIG.mqtt.publish_battery_low) {
    const batteryLowConfig = createBinarySensorConfig(deviceId, 'battery_low', device, macClean, availabilityTopic);
    const discoveryTopic = CONFIG.mqtt.discovery_prefix + '/binary_sensor/' + deviceId + '_battery_low/config';
    MQTT.publish(discoveryTopic, JSON.stringify(batteryLowConfig), 0, true);
  }

  LOGGER.info('MQTT Discovery published for: ' + mac);
}

// Publish Sensor Data to MQTT
function publishSensorData(mac, data) {
  if (!mqttConnected) return;

  const macClean = formatMacForTopic(mac);
  const stateTopic = CONFIG.mqtt.device_prefix + '/' + macClean + '/state';

  // Build payload with mandatory fields
  const payload = {
    temperature: data.temperature,
    humidity: data.humidity,
    battery: data.battery,
  };

  // Add optional fields based on configuration
  if (CONFIG.mqtt.publish_rssi) {
    payload.rssi = data.rssi;
  }

  if (CONFIG.mqtt.publish_last_seen) {
    payload.last_seen = getTimestamp();
  }

  if (CONFIG.mqtt.publish_link_quality) {
    payload.link_quality = calculateLinkQuality(data.rssi);
  }

  if (CONFIG.mqtt.publish_battery_low) {
    payload.battery_low = isBatteryLow(data.battery) ? 'ON' : 'OFF';
  }

  if (CONFIG.mqtt.publish_data_age) {
    payload.data_age = getDataAge(mac);
  }

  MQTT.publish(stateTopic, JSON.stringify(payload), 0, false);
  LOGGER.debug('Sensor data published to: ' + stateTopic);

  // Update data timestamp for age calculation
  lastDataTimestamps[mac] = getUnixTimestamp();
}

// Timeout monitoring (check all sensors periodically)
function checkSensorTimeouts() {
  if (!mqttConnected) return;

  const now = getUnixTimestamp();
  const timeout = CONFIG.mqtt.sensor_timeout;

  for (let mac in lastSeenTimestamps) {
    const lastSeen = lastSeenTimestamps[mac];
    const diff = now - lastSeen;

    if (diff > timeout) {
      publishStatus(mac, 'offline');
      LOGGER.warn('Sensor timeout: ' + mac + ' (no data for ' + diff + 's)');

      // Remove from tracking to avoid repeated warnings
      delete lastSeenTimestamps[mac];
      delete lastDataTimestamps[mac];
    }
  }
}
/******************* END MQTT FUNCTIONS *******************/

/******************* JAALEE DECODER *******************/
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

  // Calculate temperature from raw value
  calculateTemperature: function (rawValue) {
    const celsius = (TEMP_SCALE_FACTOR * rawValue) / ADC_MAX_VALUE + TEMP_OFFSET;
    return roundTo2Decimals(celsius);
  },

  // Calculate humidity from raw value
  calculateHumidity: function (rawValue) {
    const humidity = (HUMIDITY_SCALE_FACTOR * rawValue) / ADC_MAX_VALUE;
    return roundTo2Decimals(humidity);
  },

  // Parse iBeacon format (24 bytes from manufacturer_data)
  parseLongFormat: function (data) {
    if (data.length !== 24) return null;

    // Check for iBeacon header (0x02 0x15)
    if (data.at(0) !== 0x02 || data.at(1) !== 0x15) {
      return null;
    }

    // Jaalee UUID Check: Search for F5 25 anywhere in UUID (bytes 2-17)
    let hasJaaleeMarker = false;
    for (let i = 2; i < 17; i++) {
      if (data.at(i) === 0xf5 && data.at(i + 1) === 0x25) {
        hasJaaleeMarker = true;
        break;
      }
    }

    if (!hasJaaleeMarker) return null;

    // Extract and calculate temperature (bytes 18-19)
    const tempRaw = this.getUInt16BE(data, 18);
    const temperature = this.calculateTemperature(tempRaw);

    // Extract and calculate humidity (bytes 20-21)
    const humiRaw = this.getUInt16BE(data, 20);
    const humidity = this.calculateHumidity(humiRaw);

    // Extract battery (byte 23)
    const battery = data.at(23);

    // Validate sensor data
    if (!validateSensorData(temperature, humidity)) {
      LOGGER.debug('Sensor data validation failed (iBeacon format)');
      return null;
    }

    return {
      temperature: convertTemperature(temperature),
      humidity: humidity,
      battery: battery,
      format: 'iBeacon-24',
    };
  },

  // Parse short format (15-16 bytes)
  parseShortFormat: function (data, expectedMac) {
    if (data.length < 15 || data.length > 16) return null;

    // Extract battery (byte 4)
    const battery = data.at(4);

    // Extract MAC address (bytes 5-10, reversed)
    const macAddress = [];
    for (let i = 10; i >= 5; i--) {
      macAddress.push(data.at(i));
    }

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
        LOGGER.debug('MAC address mismatch in short format');
        return null;
      }
    }

    // Extract and calculate temperature (bytes -4 to -2)
    const tempRaw = this.getUInt16BE(data, data.length - 4);
    const temperature = this.calculateTemperature(tempRaw);

    // Extract and calculate humidity (last 2 bytes)
    const humiRaw = this.getUInt16BE(data, data.length - 2);
    const humidity = this.calculateHumidity(humiRaw);

    // Validate sensor data
    if (!validateSensorData(temperature, humidity)) {
      LOGGER.debug('Sensor data validation failed (short format)');
      return null;
    }

    return {
      temperature: convertTemperature(temperature),
      humidity: humidity,
      battery: battery,
      format: 'short',
    };
  },

  // Main parsing function
  parse: function (advData, macAddress) {
    if (!advData || advData.length === 0) return null;

    // Try iBeacon format first (24 bytes)
    let result = this.parseLongFormat(advData);
    if (result) return result;

    // Try short format (15-16 bytes)
    result = this.parseShortFormat(advData, macAddress);
    if (result) return result;

    return null;
  },
};
/******************* END JAALEE DECODER *******************/

/******************* DATA EMISSION *******************/
// Emit parsed data and publish to MQTT
function emitJaaleeData(data) {
  if (typeof data !== 'object') return;

  // Emit event for local use
  Shelly.emitEvent(CONFIG.eventName, data);

  // MQTT Publishing
  if (CONFIG.mqtt.enabled && data.address && mqttConnected) {
    const friendlyName = CONFIG.knownDevices[data.address] || null;

    // Publish discovery once per device
    if (!discoveredDevices[data.address]) {
      publishDiscovery(data.address, friendlyName);
      discoveredDevices[data.address] = true;
    }

    // Update last seen timestamp and status
    lastSeenTimestamps[data.address] = getUnixTimestamp();
    publishStatus(data.address, 'online');

    // Publish sensor data
    publishSensorData(data.address, data);
  }
}
/******************* END DATA EMISSION *******************/

/******************* BLE SCANNER *******************/
// BLE Scan Callback for Jaalee devices
function JaaleeScanCallback(event, result) {
  if (event !== BLE.Scanner.SCAN_RESULT) return;

  // Check if we have manufacturer data
  let advData = null;
  if (typeof result.manufacturer_data !== 'undefined') {
    for (let key in result.manufacturer_data) {
      advData = result.manufacturer_data[key];
      break;
    }
  }

  if (!advData) return;

  // Debug: Show all BLE devices
  LOGGER.debug('BLE Device: ' + result.addr + ' | RSSI: ' + result.rssi + ' | Data length: ' + advData.length);

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
    parsed.model = 'Jaalee JHT';

    // Info: Found Jaalee sensor
    LOGGER.info(
      'Jaalee JHT found - MAC: ' +
        result.addr +
        ' | Temp: ' +
        parsed.temperature +
        getTemperatureUnit() +
        ' | Humidity: ' +
        parsed.humidity +
        '%',
    );

    // Debug: Detailed information
    LOGGER.debug(
      'Battery: ' + parsed.battery + '% | ' + 'RSSI: ' + parsed.rssi + 'dBm | ' + 'Format: ' + parsed.format,
    );

    emitJaaleeData(parsed);
  }
}
/******************* END BLE SCANNER *******************/

/******************* INITIALIZATION *******************/
// Initialize the Jaalee parser
function init() {
  // Validate configuration
  if (typeof CONFIG === 'undefined') {
    console.log('[ERROR] jaABlu v' + VERSION + ': Undefined config');
    return;
  }

  // Check if Bluetooth is enabled
  const BLEConfig = Shelly.getComponentConfig('ble');
  if (!BLEConfig.enable) {
    LOGGER.error('Bluetooth is not enabled');
    return;
  }

  // Check MQTT connection if MQTT is enabled
  if (CONFIG.mqtt.enabled) {
    mqttConnected = MQTT.isConnected();
    if (mqttConnected) {
      LOGGER.info('MQTT connected');
    } else {
      LOGGER.warn('MQTT not connected - check MQTT settings');
    }
  }

  // Start BLE Scanner
  if (BLE.Scanner.isRunning()) {
    LOGGER.info('BLE scanner already running');
  } else {
    const bleScanner = BLE.Scanner.Start({
      duration_ms: BLE.Scanner.INFINITE_SCAN,
      active: CONFIG.active,
    });

    if (!bleScanner) {
      LOGGER.error('Cannot start BLE scanner');
      return;
    }
  }

  BLE.Scanner.Subscribe(JaaleeScanCallback);

  // Start timeout monitoring timer
  if (CONFIG.mqtt.enabled) {
    const checkInterval = CONFIG.mqtt.timeout_check_interval * 1000;
    Timer.set(checkInterval, true, checkSensorTimeouts);
    LOGGER.info('Timeout monitoring started (interval: ' + CONFIG.mqtt.timeout_check_interval + 's)');
  }

  // Show startup info
  const levelName =
    LOGGER.level === LOG_LEVELS.DEBUG
      ? 'DEBUG'
      : LOGGER.level === LOG_LEVELS.INFO
        ? 'INFO'
        : LOGGER.level === LOG_LEVELS.WARN
          ? 'WARN'
          : 'ERROR';

  LOGGER.info('jaABlu parser initialized (v' + VERSION + ')');
  LOGGER.info('Log level: ' + levelName);
  LOGGER.info('Temperature unit: ' + getTemperatureUnit());

  // Show enabled optional sensors
  const optionalSensors = [];
  if (CONFIG.mqtt.publish_rssi) optionalSensors.push('RSSI');
  if (CONFIG.mqtt.publish_last_seen) optionalSensors.push('Last Seen');
  if (CONFIG.mqtt.publish_link_quality) optionalSensors.push('Link Quality');
  if (CONFIG.mqtt.publish_battery_low) optionalSensors.push('Battery Low');
  if (CONFIG.mqtt.publish_data_age) optionalSensors.push('Data Age');

  if (optionalSensors.length > 0) {
    LOGGER.info('Optional sensors enabled: ' + optionalSensors.join(', '));
  } else {
    LOGGER.info('Optional sensors: none enabled');
  }
}

// Start the script
init();
/******************* END INITIALIZATION *******************/
