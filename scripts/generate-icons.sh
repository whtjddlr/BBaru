#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_SVG="$ROOT_DIR/public/icons/app-icon.svg"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

qlmanage -t -s 1024 -o "$TMP_DIR" "$SOURCE_SVG" >/dev/null 2>&1

SOURCE_PNG="$TMP_DIR/app-icon.svg.png"
IOS_ICON="$ROOT_DIR/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png"

cp "$SOURCE_PNG" "$IOS_ICON"

cp "$SOURCE_PNG" "$TMP_DIR/icon-512.png"
sips -z 512 512 "$TMP_DIR/icon-512.png" --out "$ROOT_DIR/public/icons/icon-512.png" >/dev/null

cp "$SOURCE_PNG" "$TMP_DIR/icon-512-maskable.png"
sips -z 512 512 "$TMP_DIR/icon-512-maskable.png" --out "$ROOT_DIR/public/icons/icon-512-maskable.png" >/dev/null

cp "$SOURCE_PNG" "$TMP_DIR/icon-192.png"
sips -z 192 192 "$TMP_DIR/icon-192.png" --out "$ROOT_DIR/public/icons/icon-192.png" >/dev/null

sips -g pixelWidth -g pixelHeight \
  "$IOS_ICON" \
  "$ROOT_DIR/public/icons/icon-512.png" \
  "$ROOT_DIR/public/icons/icon-512-maskable.png" \
  "$ROOT_DIR/public/icons/icon-192.png"
