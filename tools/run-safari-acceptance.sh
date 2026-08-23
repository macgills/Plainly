#!/usr/bin/env bash
set -euo pipefail

: "${SIMULATOR_UDID:?SIMULATOR_UDID is required}"
: "${AI_SECRET:?AI_SECRET is required for the Safari acceptance test}"

if ! command -v xcodegen >/dev/null 2>&1; then
  brew install xcodegen
fi

(
  cd ios-acceptance
  xcodegen generate
)

rm -rf safari-acceptance-derived artifacts-safari/plainly-safari-acceptance.xcresult

TEST_RUNNER_AI_SECRET="$AI_SECRET" xcodebuild \
  -project ios-acceptance/PlainlySafariAcceptance.xcodeproj \
  -scheme PlainlySafariAcceptance \
  -destination "platform=iOS Simulator,id=$SIMULATOR_UDID" \
  -derivedDataPath "$PWD/safari-acceptance-derived" \
  -resultBundlePath "$PWD/artifacts-safari/plainly-safari-acceptance.xcresult" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  test 2>&1 | tee artifacts-safari/safari-acceptance.log
