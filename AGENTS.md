# Agent notes — dsh-arya-computer-use

`@aryacode/dsh-plugin-arya-computer-use` 1.0.4: computer use for AryaCode. The agent
drives Windows apps through UIA refs (`agent-desktop`) and web pages through CDP
(`agent-browser`), with a takeover overlay that frames the driven window, draws a
synthetic ghost cursor and stops on a global Esc. It replaces the retired `wincu`
pack (`docs/PLAN.md` §7).

There is **no build step and no test suite**. The published payload is the committed
tree; `files` in `package.json` is the exact set that reaches a profile, so a file that
is not listed ships nothing at all.

## Layout

| Path | What it is |
|---|---|
| `index.js` | Host half: the `cordis` row, settings, the MCP adapter wiring |
| `client.js` | Settings page and chat step rows (client half, `platform: web`) |
| `cordis.patch.yml` | The row this bundle inserts |
| `mcp/adapter-server.mjs` | The MCP server the host spawns (`bin: arya-computer-use-mcp`) |
| `mcp/settings.mjs`, `mcp/takeover.mjs`, `mcp/activity.mjs` | Settings bridge, overlay, step feed |
| `skills/arya-desktop/SKILL.md` | The skill that teaches the agent the loop |
| `locale/en.json` | Every user-visible string; there is only English |
| `scripts/` | PowerShell/C# helpers the adapter calls |
| `docs/PLAN.md` | Design and the retirement path for `wincu` |
| `NOTICE.md` | Third-party attribution — the engines are pinned npm dependencies, not vendored |

## Rules

1. **The host must run elevated.** The engine's interaction lease lives at
   `C:\ProgramData\agent-desktop\<user-SID>\interaction.lock` with a protected DACL
   `{SYSTEM, Administrators, token user}`; a medium-IL (non-administrator) token fails
   validation and the adapter reports `lease_directory_untrusted`. That error means
   "restart AryaCode as administrator" — never work around it by retrying another tool
   or by loosening the DACL.
2. **Do not point `AGENT_DESKTOP_HOME` at `%LOCALAPPDATA%`.** The engine's state root is
   its default `~/.agent-desktop`; under `%LOCALAPPDATA%` inherited AppContainer ACEs
   fail the engine's own private-DACL check.
3. **Refs, not pixels.** Targeting is a semantic UIA ref; coordinates are never the
   mechanism. On `STALE_REF`/`AMBIGUOUS_TARGET`, re-snapshot and act on the fresh ref —
   do not add a coordinate fallback, which is the defect this plugin exists to remove.
   Do not add a pixel path for canvas/game surfaces either; use `ocr` plus headed mouse
   input, and only where the tree genuinely does not exist.
4. **The engines stay pinned npm dependencies.** `agent-desktop@1.2.0` and
   `agent-browser@0.41.2` are Apache-2.0 third-party tools; keep them in `dependencies`
   with `NOTICE.md` attribution, and do not vendor their binaries into this package.
5. **Verify by re-reading, not by trusting the return value.** A stateful action is
   confirmed by a following snapshot; `delivered_verified` is confirmation,
   `delivered_unverified` may be retried, and a post-action verification failure means
   the action landed — read the new state instead of repeating it.
6. **Never claim a capability from a mode switch alone.** The takeover overlay and the
   ghost cursor are presentation; the engine doing the work is what makes a step real.

## Releasing

A version bump is not a release. Four things have to be true before an update reaches a
user: `npm view <name>@<version> version` prints it, the market `catalog` branch lists
it, the entry's `releases[0].sha256` is the hash npm serves, and
`check-catalogue-parity.mjs` exits 0. One command does all four:

    node ../dsh-arya-market/scripts/release-plugin.mjs

Because this repository has no build and no tests, the evidence for a release is one
manual pass on Dev AryaCode (rule 2 of `dsh-arya-market/AGENTS-PLUGINS.md`): install the
packed tarball there, drive one Windows window through a ref, load one page through the
browser lane, press Esc and see it stop; record it in `HANDOFF.md` with the version and
digest. A hot-copy into a profile's `node_modules` is a debug aid, never a release.
Never hand-edit `data/arya-plugins.json`.
