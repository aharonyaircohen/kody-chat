# LinkStack local

Working local prototype for LinkStack, an open-source Linktree alternative.
It supports profile editing, link management, ordering, visibility, appearance
settings, browser persistence, and a public profile route. It does not need an
account or backend yet; data is saved in the current browser.

```bash
npm start
```

Open <http://127.0.0.1:4186> and create or edit your page. Your public page is
available at `/p/<your-slug>`.

The browser check covers the current product journey:

```bash
npm run test:e2e
```
