#!/usr/bin/env bash
set -euo pipefail

if [[ "$#" -ne 3 ]]; then
  echo 'usage: capture-ios-large-widget.sh <app-path> <bundle-id> <evidence-directory>' >&2
  exit 2
fi

app_path="$1"
bundle_id="$2"
evidence_directory="$3"
mkdir -p "$evidence_directory"

exec > >(tee -a "$evidence_directory/runner.log") 2>&1

if [[ ! -d "$app_path" ]]; then
  echo "Simulator app bundle was not found: $app_path" >&2
  exit 1
fi

runtime_id="$(xcrun simctl list runtimes --json | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const runtimes = JSON.parse(input).runtimes
    .filter(runtime => runtime.isAvailable && runtime.identifier.includes("iOS"))
    .sort((left, right) => String(right.version).localeCompare(String(left.version), undefined, { numeric: true }));
  if (!runtimes[0]) process.exit(1);
  process.stdout.write(runtimes[0].identifier);
});
')"

device_type="$(xcrun simctl list devicetypes --json | node -e '
let input = "";
process.stdin.on("data", chunk => input += chunk);
process.stdin.on("end", () => {
  const devices = JSON.parse(input).devicetypes;
  const preferred = ["iPhone 16", "iPhone 16 Pro", "iPhone 17", "iPhone 17 Pro", "iPhone 15 Pro"];
  const selected = preferred.map(name => devices.find(device => device.name === name)).find(Boolean)
    ?? devices.find(device => /^iPhone/.test(device.name) && !/SE/.test(device.name));
  if (!selected) process.exit(1);
  process.stdout.write(selected.identifier);
});
')"

simulator_name="TimeFlower Widget Proof ${GITHUB_RUN_ID:-local}"
udid="$(xcrun simctl create "$simulator_name" "$device_type" "$runtime_id")"
if [[ ! "$udid" =~ ^[0-9A-Fa-f-]{36}$ ]]; then
  echo "simctl returned an invalid simulator identifier: $udid" >&2
  exit 1
fi

cleanup() {
  set +e
  xcrun simctl shutdown "$udid" >/dev/null 2>&1
  xcrun simctl delete "$udid" >/dev/null 2>&1
}
trap cleanup EXIT

{
  echo "git_commit=$(git rev-parse HEAD)"
  echo "xcode=$(xcodebuild -version | tr '\n' ' ')"
  echo "runtime=$runtime_id"
  echo "device_type=$device_type"
  echo "simulator_udid=$udid"
  echo "bundle_id=$bundle_id"
} | tee "$evidence_directory/environment.txt"

xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
xcrun simctl status_bar "$udid" override \
  --time '9:41' \
  --batteryState charged \
  --batteryLevel 100 \
  --wifiBars 3 \
  --cellularBars 4
xcrun simctl install "$udid" "$app_path"

set +e
node .github/scripts/verify-ios-large-widget.mjs \
  "$udid" \
  "$bundle_id" \
  "$evidence_directory" \
  "$app_path"
verification_status=$?
set -e

if [[ "$verification_status" -ne 0 ]]; then
  xcrun simctl io "$udid" screenshot "$evidence_directory/failure-simctl.png" || true
fi

# Keep the native extension log with both successful and failed screenshots. In
# particular, this exposes App Group entitlement failures that otherwise look like
# a featureless white widget in SpringBoard.
xcrun simctl spawn "$udid" log show \
  --style compact \
  --last 15m \
  --predicate 'process == "SpringBoard" OR process CONTAINS "ExpoWidgetsTarget"' \
  > "$evidence_directory/widgetkit-system.log" 2>&1 || true

exit "$verification_status"
