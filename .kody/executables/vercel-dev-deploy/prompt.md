# vercel dev deploy

Deterministic executable. The owned shell script deploys the configured dev branch to Vercel Preview and moves `a-guy-dev-aguy.vercel.app` to the new deployment.

`VERCEL_ACCESS_TOKEN` is provided by `.kody/secrets.enc`. Non-secret deploy config is read from `.kody/variables.json`.

The script prints the final `DONE` or `FAILED` result itself.
