# Agent notes — dsh-arya-computer-use

`@aryacode/dsh-plugin-arya-computer-use` (version lives in `package.json` — never pin it
here): computer use for AryaCode, built on Vercel's desktop and browser-use MCP servers.
The agent drives Windows apps through UIA refs (`agent-desktop`) and web pages through CDP
(`agent-browser`), with a takeover overlay that frames the driven window, draws a
synthetic ghost cursor and stops on a global Esc.

There is **no build step and no test suite**. The published payload is the committed
tree; `files` in `package.json` is the exact set that reaches a profile, so a file that
is not listed ships nothing at all.

## Layout

| Path | What it is |
|---|---|
| `index.js` | Host half: the `cordis` row, settings, the MCP adapter wiring, the status route, the market-index self-registration |
| `client.js` | Settings page, plugin rows and chat step rows (client half, `platform: web`) |
| `cordis.patch.yml` | The row this bundle inserts |
| `mcp/adapter-server.mjs` | The MCP server the host mounts in-process (`bin: arya-computer-use-mcp`) |
| `mcp/browser-launcher.mjs` | Web-lane stdio pipe applying the settings to `agent-browser mcp` |
| `mcp/quiet-input.mjs` | Driver for the background posted click (no cursor, no foreground) |
| `mcp/settings.mjs`, `mcp/takeover.mjs`, `mcp/activity.mjs` | Settings bridge, overlay, step feed |
| `skills/arya-desktop/SKILL.md` | The skill that teaches the agent the loop |
| `locale/en.json` | Every user-visible string the client renders; there is only English |
| `scripts/` | PowerShell/C# helpers the adapter calls |
| `scripts/sync-market-index.mjs` | Rebuilds `index.json` from npm's publish times — run at every release |
| `index.json` | The market listing this repo serves through jsDelivr (see Releasing) |
| `CHANGELOG.md` | One entry per published version, newest first — becomes the GitHub release notes |
| `README.md` / `README.zh.md` | The public front; the market card previews images from the README |
| `docs/PLAN.md` | Design history, incl. the `wincu` retirement path (§7) — history, not positioning |
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
7. **No physical input without consent — and no reasoning that needs it.** The user's
   mouse and keyboard are theirs: `runCli` defaults to headless, and `--headed` is passed
   only by call sites that checked `physicalAllowed(args)` (`physical: true` on the call,
   or `tools {operation:"headed",on:true}`). `click` therefore climbs a ladder —
   engine semantic click → the control's own advertised action (`select`/`toggle`/
   `expand`/`collapse`) → a background `WM_*` posted click (`mcp/quiet-input.mjs`,
   no cursor movement, no foreground change) — and reports which rung it used in
   `data.mechanism`. Do not add a rung that raises the window: the Windows foreground
   lock means physical delivery only works on a window that is already foreground, so
   raising it is precisely the defect this contract removes.
8. **One engine action drives the desktop at a time.** The interaction lease is exclusive
   for the whole of `launch` (up to its `timeout_ms`, 30 s default) and a refused call
   comes back `TIMEOUT` / `details.kind: "lock_timeout"`. That is contention, not a
   broken click: the adapter skips engine-based alternatives on it and posts the click.
   Never diagnose a click from a single lock_timeout sample. `engineAction` retries a
   refused engine call twice with backoff (800/1600/3200 ms) before the ladder answers,
   so contention that reaches a tool result has already lasted several seconds.
9. **`client.js` keys its tool rows by wire name, per lane.** A `tool.call.toolview`
   registration is keyed by the wire tool name: desktop rows use
   `mcp__arya_desktop__<name>`, web rows use `mcp__arya_browser__agent_browser_<name>`.
   Never register a bare name and never apply a prefix to the other lane's names — a
   bare key collides with a first-party card (`read` is owned by
   `dsh-client-ui-tool`'s readToolview), a keyed-slot collision throws at renderer
   startup, and because the injection is a generator the throw aborts every later
   registration (issue #1: 1.0.6–1.0.9 registered 8 of 29 web rows behind one startup
   error). The registration replay at
   `KonnectSuite/.tmp-verify/toolview-keys.mjs` proves it; keep it passing.
10. **Public surfaces state what this plugin is, not what it replaced.** README (both
    languages), `locale/en.json`, the GitHub About, and release notes lead with the
    Vercel `agent-desktop`/`agent-browser` positioning. `wincu` history stays in
    `docs/PLAN.md` and `HANDOFF.md`; `NOTICE.md` and the source provenance headers are
    licence attribution and stay.

## Releasing

A version bump is not a release. Five things have to be true before an update reaches a
user: `npm view <name>@<version> version` prints it, the market `catalog` branch lists
it, the entry's `releases[0].sha256` is the hash npm serves,
`check-catalogue-parity.mjs` exits 0, and `index.json` — the listing this repo serves
through jsDelivr and self-registers at first run (`index.js`, `MARKET_INDEX_URL`) —
carries the version. One command does all of it:

    node ../dsh-arya-market/scripts/release-plugin.mjs

The command regenerates `index.json` via `scripts/sync-market-index.mjs`, commits it,
cuts the `v<version>` tag **after that commit** (a tag-pinned jsDelivr URL serves the
tag's tree forever), pushes, creates the GitHub release from the `CHANGELOG.md` entry,
then reconciles and verifies the catalogue. So before running it: bump `package.json`,
write the `CHANGELOG.md` entry (gate 1 of `dsh-arya-market/AGENTS-PLUGINS.md`), and
commit — the tree must be clean. Never hand-edit `index.json` or `data/arya-plugins.json`.

Because this repository has no build and no tests, the evidence for a release is one
manual pass on Dev AryaCode (rule 2 of `dsh-arya-market/AGENTS-PLUGINS.md`): install the
packed tarball there, drive one Windows window through a ref, load one page through the
browser lane, press Esc and see it stop; record it in `HANDOFF.md` with the version and
digest. The launch facts: `ARYACODE_REPO` must point at a checkout with `node_modules`;
use `DSH_DESKTOP_RENDERER_DEBUG_PORT=9333` (9222 is commonly taken); from an agent shell
Electron needs `ELECTRON_DISABLE_SANDBOX=1` (sandboxed child processes fail to launch —
see the HANDOFF launch note); swap versions with `pnpm remove` + `pnpm add file:<tarball>`
in the dev profile; stop only `electron.exe` whose command line matches
`*AryaCode-dev*`, never `node.exe`. A hot-copy into a profile's `node_modules` is a
debug aid, never a release.
