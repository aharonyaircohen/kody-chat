import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagePath = resolve(root, "packages/fly/package.json");
const gitMarker = resolve(root, "packages/fly/.git");

if (!existsSync(packagePath) || !existsSync(gitMarker)) {
  throw new Error(
    "Flyhub submodule is missing. Run: git submodule update --init",
  );
}

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
if (packageJson.name !== "@kody-ade/fly") {
  throw new Error("Flyhub checkout does not provide @kody-ade/fly");
}
