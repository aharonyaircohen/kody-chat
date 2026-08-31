#!/bin/sh
set -eu

Xvfb :99 -screen 0 1920x1080x24 -ac +extension RANDR &
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display :99 -localhost -forever -shared -nopw -rfbport 5900 -xrandr resize >/tmp/x11vnc.log 2>&1 &

chromium \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-background-networking \
  --disable-default-apps \
  --disable-sync \
  --no-first-run \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/kody-browser-profile \
  --window-position=0,0 \
  --window-size=1280,720 \
  --kiosk \
  about:blank >/tmp/chromium.log 2>&1 &

exec ./node_modules/.bin/tsx /app/server.ts
