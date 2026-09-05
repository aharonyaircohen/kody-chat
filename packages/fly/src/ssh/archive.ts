import { strToU8, zipSync, type Zippable } from "fflate";
import { machineSshDownload } from "./machine-access";

/** A portable OpenSSH profile, with no Fly token or server private key. */
export function machineSshArchive(
  input: Parameters<typeof machineSshDownload>[0],
) {
  const download = machineSshDownload(input);
  const readme = [
    `SSH settings for ${input.app} / ${input.machineId}`,
    "",
    `Move the ${download.alias} folder into ~/.ssh/kody/ on your Mac.`,
    "Add this line to ~/.ssh/config once:",
    "Include ~/.ssh/kody/*/config",
    "",
    "If your unzip tool changes file permissions, run:",
    `chmod 600 ~/.ssh/kody/${download.alias}/identity`,
    "",
    `Select ${download.alias} in your app's SSH connections.`,
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
