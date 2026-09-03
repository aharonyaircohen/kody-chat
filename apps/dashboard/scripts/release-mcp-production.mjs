import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runMcpProductionRelease as runRelease } from "./release-mcp-production-core.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

export async function runMcpProductionRelease({
  env = process.env,
  run = runCommand,
} = {}) {
  return runRelease({ env, run, repoRoot });
}

export function runCommand(spec) {
  return new Promise((resolvePromise, reject) => {
    process.stdout.write(`\n[release] ${spec.label}\n`);
    const child = spawn(spec.bin, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      stdio: ["inherit", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else reject(new Error(`${spec.label} failed with exit code ${code}`));
    });
  });
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (invokedPath === import.meta.url) {
  runMcpProductionRelease()
    .then(({ deploymentUrl, endpoint }) => {
      process.stdout.write(
        `\n[release] promoted ${deploymentUrl}\n[release] MCP ${endpoint}\n`,
      );
    })
    .catch((error) => {
      process.stderr.write(
        `[release] stopped: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
