import { z } from "zod";

const appSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/);
const machineSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/);

/** One paste in macOS Terminal installs the downloaded profile for OpenSSH apps. */
export function machineSshMacSetup(input: { app: string; machineId: string }) {
  const app = appSchema.parse(input.app);
  const machineId = machineSchema.parse(input.machineId);
  const alias = `kody-${app}-${machineId}`;
  const archiveName = `${alias}.zip`;
  const command = [
    "(set -e",
    `archive="$HOME/Downloads/${archiveName}"`,
    `test -f "$archive" || { echo "Download not found: ${archiveName}"; exit 1; }`,
    "temp=$(/usr/bin/mktemp -d)",
    '/usr/bin/ditto -x -k "$archive" "$temp"',
    `target="$HOME/.ssh/kody/${alias}"`,
    '/usr/bin/install -d -m 700 "$HOME/.ssh" "$HOME/.ssh/kody" "$target"',
    `/usr/bin/install -m 600 "$temp/${alias}/config" "$target/config"`,
    `/usr/bin/install -m 600 "$temp/${alias}/identity" "$target/identity"`,
    `/usr/bin/install -m 600 "$temp/${alias}/known_hosts" "$target/known_hosts"`,
    '/usr/bin/touch "$HOME/.ssh/config"',
    '/bin/chmod 600 "$HOME/.ssh/config"',
    "/usr/bin/grep -qxF 'Include ~/.ssh/kody/*/config' \"$HOME/.ssh/config\" || /usr/bin/printf '\\nInclude ~/.ssh/kody/*/config\\n' >> \"$HOME/.ssh/config\"",
    '/bin/rm -rf "$temp"',
    `echo "SSH connection installed: ${alias}"`,
    ")",
  ].join("; ");

  return { alias, archiveName, command };
}
