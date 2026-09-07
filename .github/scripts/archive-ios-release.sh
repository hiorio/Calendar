#!/usr/bin/env bash
set -euo pipefail

required=(
  APPLE_TEAM_ID
  APPLE_SIGNING_IDENTITY
  APPLE_APP_PROFILE_NAME
  APPLE_APP_PROFILE_UUID
  APPLE_WIDGET_PROFILE_NAME
  APPLE_WIDGET_PROFILE_UUID
  RELEASE_BUILD_NUMBER
  RELEASE_VERSION
  RELEASE_KEYCHAIN_PATH
  APP_IOS_BUNDLE_IDENTIFIER
)

for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required release value: $name" >&2
    exit 1
  fi
done

if [[ "${APP_VARIANT:-}" != 'production' ]]; then
  echo 'APP_VARIANT must be production for an App Store archive.' >&2
  exit 1
fi

if [[ "$APP_IOS_BUNDLE_IDENTIFIER" != 'com.hiorio.timeline' ]]; then
  echo 'The production bundle identifier is not com.hiorio.timeline.' >&2
  exit 1
fi

configured_version="$(node -p "require('./app.json').expo.version")"
if [[ "$configured_version" != "$RELEASE_VERSION" ]]; then
  echo "app.json version $configured_version does not match requested release $RELEASE_VERSION." >&2
  exit 1
fi

npm run deploy:check
npx expo prebuild --platform ios --no-install

(
  cd ios
  pod install
)

workspace="$(find ios -maxdepth 1 -type d -name '*.xcworkspace' -print -quit)"
project="$(find ios -maxdepth 1 -type d -name '*.xcodeproj' -print -quit)"
if [[ -z "$workspace" || -z "$project" ]]; then
  echo 'Generated Xcode workspace or project was not found.' >&2
  exit 1
fi

scheme="$(basename "$project" .xcodeproj)"
ruby .github/scripts/configure-ios-signing.rb "$project"

archive_path="$RUNNER_TEMP/TimeFlower.xcarchive"
export_path="$RUNNER_TEMP/TimeFlowerExport"
export_options="$RUNNER_TEMP/TimeFlowerExportOptions.plist"

xcodebuild \
  -workspace "$workspace" \
  -scheme "$scheme" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$archive_path" \
  CURRENT_PROJECT_VERSION="$RELEASE_BUILD_NUMBER" \
  OTHER_CODE_SIGN_FLAGS="--keychain $RELEASE_KEYCHAIN_PATH" \
  archive

app="$(find "$archive_path/Products/Applications" -maxdepth 1 -type d -name '*.app' -print -quit)"
if [[ -z "$app" ]]; then
  echo 'The signed archive does not contain the app.' >&2
  exit 1
fi
widget="$(find "$app/PlugIns" -maxdepth 1 -type d -name '*.appex' -print -quit)"
if [[ -z "$widget" ]]; then
  echo 'The signed archive does not contain both the app and widget extension.' >&2
  exit 1
fi

app_bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$app/Info.plist")"
widget_bundle_id="$(plutil -extract CFBundleIdentifier raw -o - "$widget/Info.plist")"
app_version="$(plutil -extract CFBundleShortVersionString raw -o - "$app/Info.plist")"
app_build="$(plutil -extract CFBundleVersion raw -o - "$app/Info.plist")"
widget_version="$(plutil -extract CFBundleShortVersionString raw -o - "$widget/Info.plist")"
widget_build="$(plutil -extract CFBundleVersion raw -o - "$widget/Info.plist")"

[[ "$app_bundle_id" == "$APP_IOS_BUNDLE_IDENTIFIER" ]]
[[ "$widget_bundle_id" == "$APP_IOS_BUNDLE_IDENTIFIER.ExpoWidgetsTarget" ]]
[[ "$app_version" == "$RELEASE_VERSION" ]]
[[ "$widget_version" == "$RELEASE_VERSION" ]]
[[ "$app_build" == "$RELEASE_BUILD_NUMBER" ]]
[[ "$widget_build" == "$RELEASE_BUILD_NUMBER" ]]

codesign --verify --deep --strict "$app"
codesign --verify --strict "$widget"

EXPORT_OPTIONS_PATH="$export_options" node <<'NODE'
const fs = require('node:fs');

const options = {
  destination: 'export',
  manageAppVersionAndBuildNumber: false,
  method: 'app-store-connect',
  provisioningProfiles: {
    [process.env.APP_IOS_BUNDLE_IDENTIFIER]: process.env.APPLE_APP_PROFILE_NAME,
    [`${process.env.APP_IOS_BUNDLE_IDENTIFIER}.ExpoWidgetsTarget`]: process.env.APPLE_WIDGET_PROFILE_NAME,
  },
  signingCertificate: process.env.APPLE_SIGNING_IDENTITY,
  signingStyle: 'manual',
  stripSwiftSymbols: true,
  teamID: process.env.APPLE_TEAM_ID,
  uploadSymbols: true,
};

fs.writeFileSync(process.env.EXPORT_OPTIONS_PATH, JSON.stringify(options));
NODE
plutil -convert xml1 "$export_options"

xcodebuild \
  -exportArchive \
  -archivePath "$archive_path" \
  -exportPath "$export_path" \
  -exportOptionsPlist "$export_options"

ipa="$(find "$export_path" -maxdepth 1 -type f -name '*.ipa' -print -quit)"
if [[ -z "$ipa" ]]; then
  echo 'The exported IPA was not found.' >&2
  exit 1
fi

echo "IPA_PATH=$ipa" >> "$GITHUB_ENV"
echo "Archived $app_bundle_id $app_version ($app_build) with $widget_bundle_id"
shasum -a 256 "$ipa"
