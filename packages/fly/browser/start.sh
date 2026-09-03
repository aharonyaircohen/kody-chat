#!/bin/sh
set -eu

export DISPLAY=:99
Xvfb "$DISPLAY" -screen 0 1920x1800x24 -nolisten tcp >/tmp/xvfb.log 2>&1 &
fluxbox >/tmp/fluxbox.log 2>&1 &
x11vnc -display "WAIT${DISPLAY}" -localhost -forever -shared -nopw >/tmp/x11vnc.log 2>&1 &

chromium \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-background-networking \
  --disable-default-apps \
  --disable-sync \
  --no-first-run \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir="${KODY_BROWSER_PROFILE_DIR:-/home/browser/profile}" \
  --window-size=1280,720 \
  about:blank >/tmp/chromium.log 2>&1 &

exec ./node_modules/.bin/tsx /app/server.ts
