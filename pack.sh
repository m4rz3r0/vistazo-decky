#!/bin/sh
# Builds out/Vistazo.zip with the layout Decky's installer expects (one top-level folder).
set -e
cd "$(dirname "$0")"
if command -v pnpm >/dev/null; then pnpm run build >/dev/null; else npx -y pnpm@9.15.9 run build >/dev/null; fi
rm -rf out && mkdir -p out/Vistazo/dist
cp plugin.json package.json main.py README.md LICENSE out/Vistazo/
cp dist/index.js out/Vistazo/dist/
cp -r theme out/Vistazo/
(cd out && zip -qr Vistazo.zip Vistazo)
sha256sum out/Vistazo.zip
