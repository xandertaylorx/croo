#!/bin/bash
# Installs the latest Croo into /Applications. Files fetched with curl are not flagged by macOS
# as "downloaded from the internet", so there is no Gatekeeper warning to click through.
set -euo pipefail

[ "$(uname -s)" = "Darwin" ] || { echo "Croo's installer is for macOS."; exit 1; }
[ "$(uname -m)" = "arm64" ] || { echo "Croo is built for Apple Silicon Macs only right now."; exit 1; }

api="https://api.github.com/repos/xandertaylorx/croo/releases/latest"
url=$(curl -fsSL "$api" | grep -o 'https://[^"]*arm64-mac\.zip' | head -n1)
[ -n "$url" ] || { echo "Couldn't find a Croo release to download."; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "Downloading ${url##*/}…"
curl -fL --progress-bar "$url" -o "$tmp/croo.zip"
ditto -x -k "$tmp/croo.zip" "$tmp"

pkill -x Croo 2>/dev/null || true
rm -rf /Applications/Croo.app
mv "$tmp/Croo.app" /Applications/Croo.app
xattr -cr /Applications/Croo.app 2>/dev/null || true
echo "Installed. Opening Croo…"
open /Applications/Croo.app
