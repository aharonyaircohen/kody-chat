#!/bin/sh
set -eu

chromium \
  --headless=new \
  --no-sandbox \
  --disable-dev-shm-usage \
  --disable-background-networking \
  --disable-default-apps \
  --disable-sync \
  --no-first-run \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port=9222 \
  --user-data-dir=/tmp/kody-browser-profile \
  --window-size=1280,720 \
  about:blank >/tmp/chromium.log 2>&1 &

exec ./node_modules/.bin/tsx /app/server.ts
