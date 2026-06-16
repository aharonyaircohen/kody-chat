# vercel dev deploy

## Job

Deploy the `dev` branch to Vercel Preview and keep the stable dev URL pointing at the latest deployment.

## Executable

Run the `vercel-dev-deploy` executable.

`VERCEL_ACCESS_TOKEN` comes from `.kody/secrets.enc`. Non-secret deploy config comes from `.kody/variables.json`.

## Allowed Commands

- Run the `vercel-dev-deploy` executable.

## Restrictions

- Manual only.
- Deploys the configured dev branch, default `dev`.
