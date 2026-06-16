#!/usr/bin/env bash
set -euo pipefail

ORIGINAL_BRANCH=""

fail() {
  echo "FAILED: $1"
  exit 1
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing command: $1"
  fi
}

require_command git
require_command node
require_command vercel

variable_value() {
  node -e '
    const fs = require("fs")
    const name = process.argv[1]
    try {
      const doc = JSON.parse(fs.readFileSync(".kody/variables.json", "utf8"))
      const value = doc.variables?.[name]?.value
      if (typeof value === "string") process.stdout.write(value)
    } catch {}
  ' "$1"
}

value_or_variable() {
  local env_value="$1"
  local variable_name="$2"
  local default_value="${3:-}"

  if [ -n "$env_value" ]; then
    printf '%s' "$env_value"
    return
  fi

  local variable
  variable="$(variable_value "$variable_name")"
  if [ -n "$variable" ]; then
    printf '%s' "$variable"
    return
  fi

  printf '%s' "$default_value"
}

SCOPE="$(value_or_variable "${VERCEL_SCOPE:-}" "VERCEL_SCOPE" "aguy")"
DEPLOY_BRANCH="$(value_or_variable "${VERCEL_PRODUCTION_BRANCH:-}" "VERCEL_PRODUCTION_BRANCH" "main")"
VERCEL_ORG_ID="$(value_or_variable "${VERCEL_ORG_ID:-}" "VERCEL_ORG_ID")"
VERCEL_PROJECT_ID="$(value_or_variable "${VERCEL_PROJECT_ID:-}" "VERCEL_PROJECT_ID")"
export VERCEL_ORG_ID VERCEL_PROJECT_ID

token="${VERCEL_ACCESS_TOKEN:-${VERCEL_TOKEN:-}}"
if [ -z "$token" ]; then
  fail "VERCEL_ACCESS_TOKEN is required"
fi

if [ -z "$VERCEL_ORG_ID" ]; then
  fail "VERCEL_ORG_ID is required"
fi

if [ -z "$VERCEL_PROJECT_ID" ]; then
  fail "VERCEL_PROJECT_ID is required"
fi

ORIGINAL_BRANCH="$(git branch --show-current)"

if ! git diff --quiet || ! git diff --cached --quiet; then
  fail "Working tree has tracked changes. Commit or stash before switching to '${DEPLOY_BRANCH}'."
fi

tmp_json="$(mktemp)"
cleanup() {
  rm -f "$tmp_json"
  if [ -n "$ORIGINAL_BRANCH" ] && [ "$ORIGINAL_BRANCH" != "$(git branch --show-current)" ]; then
    git checkout "$ORIGINAL_BRANCH" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

git fetch origin "$DEPLOY_BRANCH"
if [ "$ORIGINAL_BRANCH" != "$DEPLOY_BRANCH" ]; then
  echo "Switching from ${ORIGINAL_BRANCH} to ${DEPLOY_BRANCH}..."
  git checkout "$DEPLOY_BRANCH"
fi
git pull --ff-only origin "$DEPLOY_BRANCH"

current_branch="$(git branch --show-current)"
vercel_args=(--scope "$SCOPE" --token "$token")

echo "Deploying ${current_branch} to Vercel production..."
vercel deploy --prod --yes --format=json "${vercel_args[@]}" | tee "$tmp_json"

deployment_url="$(
  # shellcheck disable=SC2016
  node -e '
    const fs = require("fs")
    const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))
    const deployment = data.deployment && typeof data.deployment === "object" ? data.deployment : {}
    const url = data.url || deployment.url || data.inspectorUrl || deployment.inspectorUrl || ""
    if (!url) throw new Error("Vercel deploy output did not include a deployment URL")
    console.log(url.startsWith("http") ? url : `https://${url}`)
  ' "$tmp_json"
)"

cat <<RESULT
DONE
PR_SUMMARY:
- Deployed ${current_branch} to Vercel production.
- Production deployment URL: ${deployment_url}.
RESULT
