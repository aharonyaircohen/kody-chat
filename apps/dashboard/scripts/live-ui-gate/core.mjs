const REQUIRED_ENVIRONMENT = [
  "BASE_URL",
  "E2E_GITHUB_TOKEN",
  "E2E_GITHUB_REPO",
  "KODY_SERVICE_KEY",
  "KODY_MASTER_KEY",
  "KODY_LIVE_EXPECTED_BASE_URL",
  "KODY_LIVE_MUTATION_TARGET",
  "KODY_LIVE_CONFIRM_MUTATIONS",
];

function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function exactValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function publicUrl(value) {
  if (!isValidHttpUrl(value)) return "invalid";
  const url = new URL(value);
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function repositorySlug(value) {
  if (!isValidHttpUrl(value)) return "";
  const url = new URL(value);
  if (url.hostname.toLowerCase() !== "github.com") return "";
  const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return "";
  return `${parts[0]}/${parts[1].replace(/\.git$/i, "")}`;
}

export function validateLiveGateEnvironment(environment) {
  const errors = [];

  for (const name of REQUIRED_ENVIRONMENT) {
    if (!present(environment[name])) errors.push(`${name} is required`);
  }

  if (
    !present(environment.CONVEX_URL) &&
    !present(environment.NEXT_PUBLIC_CONVEX_URL)
  ) {
    errors.push("CONVEX_URL or NEXT_PUBLIC_CONVEX_URL is required");
  }

  if (exactValue(environment.RUN_REAL_E2E) !== "1") {
    errors.push("RUN_REAL_E2E must be exactly 1");
  }

  if (
    present(environment.BASE_URL) &&
    !isValidHttpUrl(exactValue(environment.BASE_URL))
  ) {
    errors.push("BASE_URL must be an absolute HTTP(S) URL");
  }

  if (
    present(environment.E2E_GITHUB_REPO) &&
    !isValidHttpUrl(exactValue(environment.E2E_GITHUB_REPO))
  ) {
    errors.push("E2E_GITHUB_REPO must be an absolute HTTP(S) URL");
  }

  const configuredRepository = repositorySlug(
    exactValue(environment.E2E_GITHUB_REPO),
  );
  if (present(environment.E2E_GITHUB_REPO) && !configuredRepository) {
    errors.push("E2E_GITHUB_REPO must be a github.com owner/repository URL");
  }

  if (
    present(environment.BASE_URL) &&
    present(environment.KODY_LIVE_EXPECTED_BASE_URL) &&
    exactValue(environment.BASE_URL) !==
      exactValue(environment.KODY_LIVE_EXPECTED_BASE_URL)
  ) {
    errors.push("BASE_URL must exactly match KODY_LIVE_EXPECTED_BASE_URL");
  }

  if (
    configuredRepository &&
    present(environment.KODY_LIVE_MUTATION_TARGET) &&
    exactValue(environment.KODY_LIVE_MUTATION_TARGET) !== configuredRepository
  ) {
    errors.push("KODY_LIVE_MUTATION_TARGET must match E2E_GITHUB_REPO");
  }

  if (
    present(environment.KODY_LIVE_MUTATION_TARGET) &&
    exactValue(environment.KODY_LIVE_CONFIRM_MUTATIONS) !==
      exactValue(environment.KODY_LIVE_MUTATION_TARGET)
  ) {
    errors.push(
      "KODY_LIVE_CONFIRM_MUTATIONS must exactly match the target repository slug",
    );
  }

  return errors;
}

function collectTests(suites, tests) {
  if (!Array.isArray(suites)) return;
  for (const suite of suites) {
    if (Array.isArray(suite?.specs)) {
      for (const spec of suite.specs) {
        if (Array.isArray(spec?.tests)) tests.push(...spec.tests);
      }
    }
    collectTests(suite?.suites, tests);
  }
}

export function summarizePlaywrightReport(report) {
  const tests = [];
  collectTests(report?.suites, tests);

  const summary = {
    total: tests.length,
    passed: 0,
    skipped: 0,
    failed: 0,
    flaky: 0,
  };

  for (const test of tests) {
    switch (test?.status) {
      case "expected":
        summary.passed += 1;
        break;
      case "skipped":
        summary.skipped += 1;
        break;
      case "flaky":
        summary.flaky += 1;
        break;
      default:
        summary.failed += 1;
        break;
    }
  }

  return summary;
}

function plural(count, singular, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function normalizedPath(value) {
  return typeof value === "string" ? value.replaceAll("\\", "/") : "";
}

function pathBasename(value) {
  return normalizedPath(value).split("/").at(-1) ?? "";
}

function reportJourneyKeys(report) {
  const keys = new Set();
  function visit(suites) {
    if (!Array.isArray(suites)) return;
    for (const suite of suites) {
      for (const spec of suite?.specs ?? []) {
        keys.add(`${normalizedPath(spec.file)}::${spec.title ?? ""}`);
      }
      visit(suite?.suites);
    }
  }
  visit(report?.suites);
  return keys;
}

export function assertLiveGateReport(report, requiredJourneys) {
  const summary = summarizePlaywrightReport(report);

  if (summary.total === 0) throw new Error("No live UI journeys executed");
  if (Array.isArray(requiredJourneys)) {
    const discovered = reportJourneyKeys(report);
    const missing = requiredJourneys.filter((journey) => {
      const expectedFile = normalizedPath(journey.file);
      return ![...discovered].some((key) => {
        const separator = key.lastIndexOf("::");
        const actualFile = key.slice(0, separator);
        const actualTitle = key.slice(separator + 2);
        return (
          actualTitle === journey.title &&
          (actualFile === expectedFile ||
            pathBasename(actualFile) === pathBasename(expectedFile))
        );
      });
    });
    if (missing.length > 0) {
      throw new Error(
        `Missing required live UI journeys: ${missing.map((journey) => journey.id).join(", ")}`,
      );
    }
  } else if (
    Number.isInteger(requiredJourneys) &&
    summary.total !== requiredJourneys
  ) {
    throw new Error(
      `Expected ${requiredJourneys} live UI journeys but Playwright reported ${summary.total}`,
    );
  }
  if (summary.skipped > 0) {
    throw new Error(`${plural(summary.skipped, "live UI journey")} skipped`);
  }
  if (summary.failed > 0) {
    throw new Error(`${plural(summary.failed, "live UI journey")} failed`);
  }
  if (summary.flaky > 0) {
    throw new Error(
      `${plural(summary.flaky, "live UI journey")} ${summary.flaky === 1 ? "was" : "were"} flaky`,
    );
  }

  return summary;
}

export function assertLiveJourneyCoverage(missingJourneys) {
  if (!Array.isArray(missingJourneys) || missingJourneys.length === 0) return;
  throw new Error(
    `Required live UI journeys not implemented: ${missingJourneys.join(", ")}`,
  );
}

export function buildPlaywrightArguments(specs, options = {}) {
  const args = [
    "exec",
    "playwright",
    "test",
    ...specs,
    "--config=playwright.live.config.ts",
    "--project=live-chromium",
    "--workers=1",
    "--reporter=list,json,html",
  ];

  if (present(options.outputDir)) {
    args.push(`--output=${options.outputDir}`);
  }

  return args;
}

export function buildLiveGateMetadata(environment, run) {
  return {
    commit: run.commit,
    startedAt: run.startedAt,
    targetUrl: publicUrl(exactValue(environment.BASE_URL)),
    targetRepository: publicUrl(exactValue(environment.E2E_GITHUB_REPO)),
    realE2EEnabled: exactValue(environment.RUN_REAL_E2E) === "1",
    mutationsConfirmed:
      exactValue(environment.KODY_LIVE_CONFIRM_MUTATIONS) ===
      exactValue(environment.KODY_LIVE_MUTATION_TARGET),
    mutationTarget: exactValue(environment.KODY_LIVE_MUTATION_TARGET),
  };
}

export function sanitizeDiagnosticUrl(value) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "invalid-url";
  }
}

export function redactDiagnosticText(value, secrets) {
  let redacted = String(value);
  for (const secret of secrets) {
    if (!present(secret)) continue;
    redacted = redacted.split(secret).join("[REDACTED]");
  }
  return redacted;
}

async function checkedJson(fetchImpl, url, init, validate) {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return false;
    const data = await response.json();
    return validate(data);
  } catch {
    return false;
  }
}

export async function runLiveServicePreflight(environment, fetchImpl = fetch) {
  const baseUrl = exactValue(environment.BASE_URL).replace(/\/$/, "");
  const repoSlug = repositorySlug(exactValue(environment.E2E_GITHUB_REPO));
  const [owner, repo] = repoSlug.split("/");
  const token = exactValue(environment.E2E_GITHUB_TOKEN);
  const convexUrl = exactValue(
    environment.CONVEX_URL || environment.NEXT_PUBLIC_CONVEX_URL,
  ).replace(/\/$/, "");
  const serviceKey = exactValue(environment.KODY_SERVICE_KEY);

  const checks = [
    {
      name: "dashboard-auth",
      ok: await checkedJson(
        fetchImpl,
        `${baseUrl}/api/kody/auth/me`,
        {
          headers: {
            "x-kody-token": token,
            "x-kody-owner": owner,
            "x-kody-repo": repo,
          },
        },
        (data) =>
          data?.authenticated === true &&
          data?.owner === owner &&
          data?.repo === repo,
      ),
    },
    {
      name: "github-repository",
      ok: await checkedJson(
        fetchImpl,
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
        },
        (data) =>
          typeof data?.full_name === "string" &&
          data.full_name.toLowerCase() === repoSlug.toLowerCase(),
      ),
    },
    {
      name: "convex-service-auth",
      ok: await checkedJson(
        fetchImpl,
        `${convexUrl}/api/query`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "chatEvents:recentSessions",
            args: { tenantId: repoSlug, limit: 1, serviceKey },
            format: "json",
          }),
        },
        (data) => data?.status === "success",
      ),
    },
  ];

  const failed = checks.filter((check) => !check.ok);
  if (failed.length > 0) {
    throw new Error(
      `Live service preflight failed: ${failed.map((check) => check.name).join(", ")}`,
    );
  }

  return checks;
}
