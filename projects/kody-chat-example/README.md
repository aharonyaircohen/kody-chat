# Kody Chat example

A standalone React app using the published `@kody-ade/kody-chat` package.
It demonstrates host-owned transport, conversation persistence, page context,
attachments, navigation, and plugin events without Dashboard dependencies.

```bash
npm install
npm run build
npm start
```

Open <http://127.0.0.1:4178>.

The sample keeps conversations in browser `localStorage` and uses a local mock
transport. Replace `transport.send` in `src/app.jsx` with your authenticated
server endpoint for a real integration. Secrets and privileged actions must
stay on your server.

Run the browser journey with:

```bash
npm run test:e2e
```
