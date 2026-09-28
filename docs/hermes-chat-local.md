# Kody chat with local Hermes

The existing Kody chat screen uses Hermes for sessions, models, effort, attachments, tools, and replies. The rest of the dashboard is still present.

1. Start Hermes: `hermes dashboard` (default `http://127.0.0.1:9119`). Configure its model and tools in the Hermes dashboard.
2. Start Kody: `pnpm --filter kody-dashboard dev` (default `http://localhost:3333`). Sign in to a Kody account and open `/chat`.
3. Kody reads Hermes' local session token from the dashboard. Set `HERMES_BASE_URL` to use a different local URL. A remote Hermes host also requires `HERMES_SESSION_TOKEN` on the Kody server.

The Kody server must be able to reach Hermes. This first phase has been tested with both services running locally. A hosted Hermes connection and deployed Kody candidate still need a separate live check before release. Existing Kody chat routes remain in the repository for other legacy features; the main chat send path uses `/api/kody/hermes/*`.
