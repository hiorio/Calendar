const fs = require('node:fs');

const { IOSConfig, createRunOncePlugin } = require('expo/config-plugins');

const PLUGIN_NAME = 'with-timeflower-wallpaper-intent';
const PLUGIN_VERSION = '1.0.0';
const SWIFT_FILE_NAME = 'TimeFlowerWallpaperIntent.swift';
const REGRESSION_MARKER = 'TIMEFLOWER_WALLPAPER_INTENT_V1';

/**
 * Adds TimeFlower's wallpaper-producing App Intent to the main iOS app target.
 *
 * The intent intentionally lives in the app target, rather than ExpoWidgetsTarget:
 * expo-widgets recreates its generated extension directory on every prebuild. The
 * main target already receives the same App Group entitlement and
 * ExpoWidgetsAppGroupIdentifier Info.plist entry from expo-widgets.
 */
function withTimeFlowerWallpaperIntent(config) {
  const sourcePath = require.resolve(`./ios/${SWIFT_FILE_NAME}`);
  const contents = fs.readFileSync(sourcePath, 'utf8');

  if (!contents.includes(REGRESSION_MARKER)) {
    throw new Error(
      `${PLUGIN_NAME}: ${SWIFT_FILE_NAME} is missing ${REGRESSION_MARKER}`,
    );
  }

  return IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
    filePath: SWIFT_FILE_NAME,
    contents,
    overwrite: true,
  });
}

module.exports = createRunOncePlugin(
  withTimeFlowerWallpaperIntent,
  PLUGIN_NAME,
  PLUGIN_VERSION,
);
