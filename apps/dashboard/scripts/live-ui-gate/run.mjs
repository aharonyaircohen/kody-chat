import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";

import {
  assertLiveGateReport,
  assertLiveJourneyCoverage,
  buildLiveGateMetadata,
  buildPlaywrightArguments,
  runLiveServicePreflight,
  validateLiveGateEnvironment,
} from "./core.mjs";
import {
  EXPECTED_LIVE_UI_TESTS,
  LIVE_UI_JOURNEYS,
  LIVE_UI_SPECS,
  MISSING_LIVE_UI_JOURNEYS,
} from "./manifest.mjs";

const dashboardRoot = fileURLToPath(new URL("../..", import.meta.url));
loadDotenv({ path: join(dashboardRoot, ".env"), override: false, quiet: true });

function fail(message) {
  process.stderr.write(`Live UI gate blocked: ${message}\n`);
  process.exitCode = 1;
}

function currentCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: dashboardRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const environmentErrors = validateLiveGateEnvironment(process.env);
if (environmentErrors.length > 0) {
  for (const error of environmentErrors) fail(error);
  process.exit();
}

try {
  const checks = await runLiveServicePreflight(process.env);
  for (const check of checks) {
    process.stdout.write(`PASS ${check.name}\n`);
  }
} catch (error) {
  const message =
    error instanceof Error ? error.message : "Live service preflight failed";
  fail(message);
  process.exit();
}

const startedAt = new Date().toISOString();
const runId = startedAt.replace(/[:.]/g, "-");
const artifactDir = join(dashboardRoot, "test-results", "live-ui-gate", runId);
const reportPath = join(artifactDir, "results.json");
const htmlPath = join(artifactDir, "html");
const outputPath = join(artifactDir, "artifacts");
mkdirSync(artifactDir, { recursive: true });

const metadata = {
  ...buildLiveGateMetadata(process.env, {
    commit: currentCommit(),
    startedAt,
  }),
  expectedTests: EXPECTED_LIVE_UI_TESTS,
  specs: LIVE_UI_SPECS,
  notImplemented: MISSING_LIVE_UI_JOURNEYS,
};
writeFileSync(
  join(artifactDir, "metadata.json"),
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);

const displayDir = relative(dashboardRoot, artifactDir);
process.stdout.write(
  `Live UI gate target confirmed. Artifacts: ${displayDir}\n`,
);

if (process.argv.includes("--preflight-only")) {
  process.stdout.write(
    "Live UI gate preflight passed; Playwright was not run.\n",
  );
  process.exit();
}

const playwrightEnvironment = {
  ...process.env,
  PLAYWRIGHT_JSON_OUTPUT_NAME: reportPath,
  PLAYWRIGHT_HTML_OUTPUT_DIR: htmlPath,
  PLAYWRIGHT_HTML_OPEN: "never",
};

const playwright = spawnSync(
  "pnpm",
  buildPlaywrightArguments(LIVE_UI_SPECS, { outputDir: outputPath }),
  {
    cwd: dashboardRoot,
    env: playwrightEnvironment,
    stdio: "inherit",
  },
);

if (playwright.error) {
  fail("Playwright could not start");
  process.exit();
}

if (!existsSync(reportPath)) {
  fail("Playwright did not produce the required JSON report");
  process.exit();
}

try {
  const report = JSON.parse(readFileSync(reportPath, "utf8"));
  const summary = assertLiveGateReport(report, LIVE_UI_JOURNEYS);
  const completeSummary = {
    ...summary,
    notImplemented: MISSING_LIVE_UI_JOURNEYS.length,
  };
  writeFileSync(
    join(artifactDir, "summary.json"),
    `${JSON.stringify(completeSummary, null, 2)}\n`,
    "utf8",
  );
  assertLiveJourneyCoverage(MISSING_LIVE_UI_JOURNEYS);
  if (playwright.status !== 0) {
    fail(`Playwright exited with status ${playwright.status ?? "unknown"}`);
  } else {
    process.stdout.write(
      `Live UI gate passed: ${summary.passed}/${summary.total} journeys.\n`,
    );
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "invalid report";
  fail(message);
}
