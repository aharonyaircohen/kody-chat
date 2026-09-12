# Resume Kody work in fresh Codex

Status: repository coding continuity passed the clean VPS qualification described
in `kody-mcp-clean-vps-evidence.md`. This does not establish restoration of all
native Codex state or automatic use in every client.

## Prerequisites

- A supported fresh Codex CLI installation and a separately authenticated Codex
  account. Follow the current official installation and authentication guidance:
  https://learn.chatgpt.com/docs/cli and https://learn.chatgpt.com/docs/auth.
- A Kody connection issued for the intended repository, with repository memory
  read/write and work access. Do not grant personal or deletion access for the
  repository trial. Use a separate named connection for each client.
- Authorized Git access and a reachable source revision containing the canonical
  `skills/kody-mcp` directory and project instructions. A local-only plan, skill,
  uncommitted change or commit is not available to the new machine.

## Setup

1. Clone the repository at the revision recorded in the handoff. If that revision
   or an additional work artifact is unavailable, stop the restoration and report
   the missing reference. Never silently use a different revision.
2. Install the entire `skills/kody-mcp` directory, including `references`, into
   the client's supported skills directory (for current Codex CLI,
   `~/.agents/skills/kody-mcp`). Preserve existing unrelated skills.
3. Supply `KODY_MCP_TOKEN` through the host's secret environment mechanism. Do not
   paste a token into a prompt, checked-in file, log, or command argument. The
   variable must be available to the Codex process each time it starts.
4. Configure the native connection with the supported CLI command, substituting
   the endpoint supplied with the connection:

   ```sh
   codex mcp add kody --url https://kody-dashboard-aguy.vercel.app/api/kody/mcp --bearer-token-env-var KODY_MCP_TOKEN
   ```

   If a connection named `kody` already exists, inspect its non-secret settings
   and reconcile it instead of overwriting an unrelated connection. Desktop
   processes may not inherit terminal environment variables. Configure their
   secret source using the supported client mechanism before starting them.

5. Install the standing continuity instruction from the canonical skill in the
   user's global `~/.codex/AGENTS.md`, preserving existing instructions. Apply it
   automatically to substantial coding work only when the configured connection
   matches the current repository. Keep normal successful reads and saves quiet;
   report access failures, unsaved progress, or ambiguity that affects the task.
   Repository rules may add project details. A skill or connection installation
   alone does not guarantee retrieval or checkpoints. Start a new Codex session
   after setup so it loads the instructions and native connection.
6. Give an ordinary coding request without mentioning Kody or asking it to save
   memory. It should call native Kody
   tools, confirm scope, retrieve work and memory, verify code state, and identify
   the next action. Do not inject the expected answer or hidden record IDs during
   qualification.

### Approvals for unattended runs

Token permissions and Codex approvals are separate. The clean VPS trial found
that plain `codex exec` could read Kody but rejected a checkpoint before sending
it: `MCP tool call requires approval, but approval policy is never`.
Do not interpret that result as saved progress or work around it with shell HTTP.
Use interactive approvals, or the supported `--approve-for-me` mode for an
authorized unattended task. It routes required MCP approvals through Codex's
reviewer; it does not broaden the token's grants. If the reviewer rejects the
write, preserve the unsaved checkpoint and resolve that decision normally.

See [official approval review guidance](https://learn.chatgpt.com/docs/sandboxing/auto-review).

## Restore and verify

Restore only the environment described by the versioned setup instructions.
Check prerequisite versions and obtain credentials separately. Preserve remote
artifact checksums and code base revisions. Never overwrite unrelated local edits
to apply a handoff.

For this monorepo, a fresh checkout needs its dependency packages built before
root typechecking: after `pnpm install --frozen-lockfile`, run
`pnpm --filter @kody-ade/agency-domain --filter @kody-ade/memory --filter @kody-ade/engine-contracts --filter @kody-ade/kody-chat build` before
`pnpm verify`. This was checked in an isolated checkout; an existing checkout can
hide missing generated declarations.

On sandboxed Linux, place the dependency store and build caches in a writable
workspace. In the qualified official Node image, native dependency installation
needed `npm_config_nodedir=/usr/local` to use the installed Node headers instead
of extracting downloaded headers with unsupported ownership changes. Inspect
the actual header location before using this setting on another image. The
successful install used `pnpm install --frozen-lockfile --store-dir /work/.pnpm-store`
with `npm_config_nodedir=/usr/local`, `npm_config_devdir=/work/.node-gyp`, and
`XDG_CACHE_HOME=/work/.cache`.

For a transported source archive, verify its recorded checksum and safe relative
paths, then extract without carrying the source machine's user/group ownership
(`tar --no-same-owner`). Verify the restored files against the archive. The
archive may contain approved source changes and canonical skills, never native
Codex state, credentials, or dependency directories.

Run the next relevant coding step and its test. Save its evidence and checkpoint
to the same Kody work record with the observed revision, then read it back.
Verify that the original client can retrieve the new checkpoint. A new process
must then retrieve the latest checkpoint without relying on the first session.

Missing memory, expired access, unavailable Kody, or inaccessible code is a
specific blocker. An empty page with a continuation cursor is not the end of
memory. Retry ambiguous writes only after reconciliation; do not invent a new
request key to bypass uncertainty.

Do not copy old `~/.codex` databases, sessions, chat transcripts, or credentials.
This procedure restores useful work context, not running terminals, browser
sessions, model internals, native conversation IDs, or scheduler state.

## Evidence to retain

Record client/skill versions, source revision, Kody contract and repository,
task/checkpoint IDs, sanitized test outcomes, artifact checksums, and required
user interventions. Report native connection, fresh-session continuation, and
clean-VPS continuation separately. No credentials belong in this evidence.
