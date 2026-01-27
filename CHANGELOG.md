# Changelog

## [1.3.0] - 2026-01-27

### Added

- Configurable temperature unit support (Celsius/Fahrenheit)
- Configuration option `CONFIG.temperature.unit` ('celsius' or 'fahrenheit')
- Optional Link Quality sensor (RSSI as percentage 0-100%)
- Optional Battery Low Warning binary sensor with configurable threshold
- Optional Data Age sensor to monitor data freshness
- Configuration option `battery_low_threshold` (default: 20%)
- Configuration option `timeout_check_interval` for flexible timeout monitoring
- Icons for Link Quality (mdi:wifi) and Data Age (mdi:clock-outline)
- Centralized version number used in all log outputs and device info
- Device info now includes `sw_version` field for Home Assistant

### Changed

- Improved code structure with clear sections and better organization
- Enhanced logging with version number in all log messages
- Temperature conversion now happens in decoder functions
- Discovery config uses dynamic temperature unit based on configuration
- Timeout check interval reduced from 60s to 120s (configurable)
- Offline sensors are now removed from tracking to avoid repeated warnings
- Log messages now include version number for easier debugging

### Optimized

- MQTT connection status is now cached in `mqttConnected` variable
- Created helper functions to reduce code duplication:
  - `roundTo2Decimals()` for consistent rounding
  - `validateSensorData()` for unified sensor validation
  - `createDeviceInfo()` for reusable device information
  - `createSensorConfig()` factory pattern for sensor discovery
  - `createBinarySensorConfig()` for binary sensor discovery
  - `convertTemperature()` for automatic unit conversion
  - `getTemperatureUnit()` for dynamic unit display
  - `calculateLinkQuality()` for RSSI to percentage conversion
  - `isBatteryLow()` for battery status check
  - `getDataAge()` for data freshness monitoring
- Sensor calculation constants extracted (TEMP_SCALE_FACTOR, ADC_MAX_VALUE, etc.)
- RSSI quality range defined as constants (RSSI_EXCELLENT, RSSI_UNUSABLE)
- Extracted repeated calculations into helper functions
- Better separation of concerns between parsing and presentation
- Improved code maintainability with centralized constants

## [1.2.3] - 2026-01-26

### Changed

- Rename repository to `jaABlu`
- Update README and Badges to new repository name

## [1.2.2] - 2025-12-04

### Fixed

- GitHub Actions release workflow permissions
- Release process now works with `softprops/action-gh-release@v2`

## [1.2.1] - 2025-12-04

### Fixed

- MQTT discovery timing issue by adding connection check before publishing
- Discovery messages now only sent when MQTT is confirmed connected
