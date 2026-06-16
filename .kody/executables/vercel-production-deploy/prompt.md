# vercel production deploy

Deterministic executable. The owned shell script deploys the configured production branch to Vercel Production with `vercel deploy --prod`.

`VERCEL_ACCESS_TOKEN` is provided by `.kody/secrets.enc`. Non-secret deploy config is read from `.kody/variables.json`.

The script prints the final `DONE` or `FAILED` result itself.
