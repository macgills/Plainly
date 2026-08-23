#!/usr/bin/env bash
set -euo pipefail

: "${AI_SECRET:?Set AI_SECRET to an OpenAI API key, for example: AI_SECRET=\"sk-...\" npm run ipad}"

for command in node npm gradle xcrun xcodebuild; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Missing required command: $command" >&2
    exit 1
  fi
done

if ! command -v brew >/dev/null 2>&1; then
  echo "Homebrew is required to install XcodeGen automatically. Install it from https://brew.sh and retry." >&2
  exit 1
fi

npm run build
npm run build:safari-extension
gradle -p core --no-daemon linkDebugFrameworkIosSimulatorArm64

if xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  PACKAGER=safari-web-extension-packager
elif xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  PACKAGER=safari-web-extension-converter
else
  echo "Your Xcode installation does not contain a Safari Web Extension packager." >&2
  exit 1
fi

SIMULATOR_UDID="$(python3 - <<'PY'
import json, subprocess

def load(*args):
    return json.loads(subprocess.check_output(args, text=True))

devices = load('xcrun', 'simctl', 'list', 'devices', 'available', '-j')['devices']
for runtime, candidates in reversed(list(devices.items())):
    if 'iOS' not in runtime:
        continue
    for device in candidates:
        if 'iPad' in device['name']:
            print(device['udid'])
            raise SystemExit

raise SystemExit('No iPad simulator is installed. Open Xcode > Settings > Components and install an iOS simulator runtime.')
PY
)"
export SIMULATOR_UDID

echo "Using iPad simulator: $SIMULATOR_UDID"
xcrun simctl boot "$SIMULATOR_UDID" 2>/dev/null || true
open -a Simulator

rm -rf safari-generated safari-derived artifacts-safari
mkdir -p safari-generated artifacts-safari

xcrun "$PACKAGER" build/safari-extension \
  --project-location "$PWD/safari-generated" \
  --app-name Plainly \
  --bundle-identifier dev.plainly.browser \
  --swift \
  --ios-only \
  --copy-resources \
  --no-open \
  --no-prompt

PROJECT="$(find safari-generated -name '*.xcodeproj' -print -quit)"
[ -n "$PROJECT" ] || { echo "Safari packager did not create an Xcode project." >&2; exit 1; }

PBXPROJ="$PROJECT/project.pbxproj"
python3 - "$PBXPROJ" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text(encoding='utf-8')
text = text.replace('dev.plainly.Plainly', 'dev.plainly.browser')
path.write_text(text, encoding='utf-8')
PY

SCHEME="$(xcodebuild -project "$PROJECT" -list -json | python3 -c 'import json,sys; p=json.load(sys.stdin)["project"]; s=p.get("schemes",[]); preferred=[x for x in s if "(iOS)" in x and "Extension" not in x]; print((preferred or s)[0])')"

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID,arch=arm64" \
  -derivedDataPath "$PWD/safari-derived" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  ONLY_ACTIVE_ARCH=YES \
  ARCHS=arm64 \
  build

APP="$(find safari-derived/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' -print -quit)"
[ -n "$APP" ] || { echo "Xcode did not produce the Plainly app." >&2; exit 1; }

xcrun simctl bootstatus "$SIMULATOR_UDID" -b
xcrun simctl install "$SIMULATOR_UDID" "$APP"
xcrun simctl launch "$SIMULATOR_UDID" dev.plainly.browser

bash tools/run-safari-acceptance.sh

echo
echo "Plainly is installed and working in the iPad simulator. The Simulator app has been left open for you."
