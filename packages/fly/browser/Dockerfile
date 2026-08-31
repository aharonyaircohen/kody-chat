FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:99 \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fluxbox \
      x11vnc \
      xvfb \
      x11-xserver-utils \
      xcvt \
      ca-certificates \
      fonts-liberation \
      fonts-noto-core \
      fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY packages/fly/browser/package.json packages/fly/browser/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY packages/fly/browser/server.ts ./server.ts
COPY packages/fly/browser/start.sh ./start.sh
COPY packages/fly/src/browsers ./src/browsers

RUN chmod +x /app/start.sh \
    && useradd --create-home --uid 10001 browser \
    && chown -R browser:browser /app /home/browser

USER browser
EXPOSE 8080
CMD ["/app/start.sh"]
