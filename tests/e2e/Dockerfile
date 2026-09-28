# Linux environment for the end-to-end suite. Used by `pnpm run test:e2e:docker`; CI installs the same packages.
FROM rust:1.98-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential curl file libayatana-appindicator3-dev librsvg2-dev libssl-dev \
      libwebkit2gtk-4.1-dev libxdo-dev webkit2gtk-driver xvfb xauth dbus-x11 \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && npm install --global pnpm@12 \
    && rm -rf /var/lib/apt/lists/*

RUN cargo install tauri-driver --locked

WORKDIR /app
ENV CI=true
CMD ["sh", "-c", "pnpm install --frozen-lockfile && dbus-run-session -- xvfb-run -a pnpm run test:e2e"]
