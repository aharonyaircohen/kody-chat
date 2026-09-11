import { strToU8, zipSync, type Zippable } from "fflate";
import { machineSshDownload } from "./machine-access";
import { machineSshMacSetup } from "./mac-setup";

/** A portable OpenSSH profile, with no Fly token or server private key. */
export function machineSshArchive(
  input: Parameters<typeof machineSshDownload>[0],
) {
  const download = machineSshDownload(input);
  const macSetup = machineSshMacSetup(input);
  const readme = [
    `SSH settings for ${input.app} / ${input.machineId}`,
    "",
    "Mac setup:",
    "1. Open Terminal.",
    "2. Paste this command and press Return:",
    "",
    macSetup.command,
    "",
    "3. In ChatGPT Desktop, open Settings > Connections > SSH > Add.",
    `4. Select ${download.alias}.`,
    "",
    `Or run: ssh ${download.alias}`,
    "Requires OpenSSH and openssl on your computer.",
    "Keep the identity file private: it grants access to this machine.",
    "",
  ].join("\n");
  const files: Zippable = {};
  for (const [name, content] of Object.entries({
    config: download.config,
    identity: download.identity,
    known_hosts: download.knownHosts,
    "README.txt": readme,
  })) {
    files[`${download.alias}/${name}`] = [
      strToU8(content),
      { os: 3, attrs: (0o100600 << 16) >>> 0 },
    ];
  }
  return { filename: `${download.alias}.zip`, bytes: zipSync(files) };
}
