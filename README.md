# Arya Computer Use

Computer use for [DeepSeek Harness / AryaCode](https://github.com/KonnectSuite): drive Windows desktop apps through **native accessibility refs** (UIA) instead of pixel coordinates, with a **takeover overlay** that frames the window being driven, shows what the agent is doing, keeps a synthetic ghost cursor where it acts (your own pointer is never followed), and stops on a global Esc. The agent calls itself **Arya** in that overlay by default, and the name is a setting.

Replaces [dsh-computer-use-win](https://github.com/Yu-tao-Li/dsh-computer-use-win) (wincu) completely — see [docs/PLAN.md](docs/PLAN.md) §7 for the retirement path.

## Why

| wincu complaint | Arya Computer Use |
| --- | --- |
| Slow (PowerShell + UIA backend) | Native Rust engine: ~90 ms per call measured on this devbox (snapshot 90 ms, ref action 85 ms, `list-windows` 56 ms). Every CLI call costs ~85 ms of process start plus UIA init, so the number of calls, not the tool, sets the latency — `batch` runs up to 20 steps in one call (6 steps: 332 ms engine vs ~510 ms step by step) |
| Pixel alignment off | Ref-based semantic UIA — coordinates are never the targeting mechanism; identical twins are refused, not mis-clicked |
| Chinese UI/docs | English throughout |
| (kept) DSH integration + setup UI | Settings page, chat step rows, takeover overlay, Esc kill, tool presets |

## Engines (not vendored — pinned npm dependencies)

- [`agent-desktop`](https://github.com/vercel-labs/agent-desktop) `1.2.0` (Apache-2.0) — accessibility-tree computer use CLI, native Windows binaries on npm. Reference mirror: [KonnectSuite/dsh-arya-agent-desktop](https://github.com/KonnectSuite/dsh-arya-agent-desktop).
- [`agent-browser`](https://github.com/vercel-labs/agent-browser) `0.41.2` (Apache-2.0) — web lane via CDP (`agent-browser mcp`).

## Requirements

- **DSH host must run elevated (Run as administrator).** The engine's interaction lease lives at `C:\ProgramData\agent-desktop\<user-SID>\interaction.lock` with a protected DACL `{SYSTEM, Administrators, token user}`; a non-elevated medium-IL token fails validation (`lease_directory_untrusted`). The adapter surfaces this as an explicit "run AryaCode as administrator" hint.
- Accessibility permission (`desktop_status` reports `accessibility: granted`).
- Engine state root is the engine default `~/.agent-desktop` — do **not** point `AGENT_DESKTOP_HOME` at `%LOCALAPPDATA%` (inherited AppContainer ACEs fail the engine's private-DACL check).

## Status

**Phases 0–2 complete (Phase 0 accepted 2026-11-06; takeover UI verified live 2026-11-07).**

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 | Evaluation spike: raw `agent-desktop mcp` row, drive Notepad/Explorer/Chrome — speed ✓, readable trees ✓, refs-not-pixels ✓ | ✅ accepted, spike removed |
| 1 | Adapter MCP server: Lite 22 tools, per-conversation session lifecycle, headed toggle + foreground promotion, screenshot→file path, WinRT OCR, skill | ✅ built, installed, driven in-host |
| 2 | Takeover UI: window rim + banner + Esc kill, configurable ghost cursor, settings page, chat step rows, driver lock, English UI | ✅ built + verified live |
| 3 | Web lane (`arya_browser` row), sign-in profiles, attach-to-your-Chrome, **wincu retirement** | planned |
| 4 | Lazy preset, notifications/clipboard/trace, npm publish | planned |

Lite 22 tool surface: `snapshot, find, get, is, click, focus, double_click, right_click, expand, collapse, toggle, set_value, type, press, scroll, list_windows, launch, wait, screenshot, ocr, batch, tools` (superset of wincu Lite 12; `set_value` fills a field through the accessibility value pattern without touching the pointer — **the headless text path, use it for text entry**; `expand`/`collapse`/`toggle` are semantic UIA patterns and stay headless; `focus`, `double_click` and `right-click` have no headless path on Windows, so each one drives the real pointer for that single call and never latches the conversation; `type` likewise synthesizes real keystrokes, which on Windows is physical input; `tools` manages headed/overlay/session state).

Full plan: [docs/PLAN.md](docs/PLAN.md).

## Layout

```
package.json          Cordis bundle manifest (dsh.bundle.patch) + pinned engine deps
cordis.patch.yml      rows: arya-computer-use (Host), mcp-arya-desktop, mcp-arya-browser
index.js              Host plugin entry (settings, driver lock, takeover mgmt, status route)
client.js             Settings page + chat step rows (client plugin)
mcp/adapter-server.mjs  adapter MCP server (Lite 22 tool surface)
scripts/windows-takeover.cs  window rim + banner + progress + ghost cursor + global Esc
scripts/ocr.ps1       WinRT OCR helper (Phase 1)
skills/arya-desktop/  observe-act loop guide (Phase 1)
locale/ icon.svg      Plugin Manager display metadata
docs/PLAN.md          complete v1 plan
```

## Install

### From the plugin market (recommended)

1. In AryaCode: **Plugins → Arya Plugin Market → add a source** and paste
   `https://cdn.jsdelivr.net/gh/KonnectSuite/dsh-arya-computer-use@main/index.json`
2. Install **Arya Computer Use** from the list, then restart AryaCode.

The published package is `@aryacode/dsh-plugin-arya-computer-use` (npm, public). Everything it needs ships in the tarball: the desktop adapter, the browser launcher, the takeover overlay sources and the skill. The two MCP lanes are mounted **in-process** by `index.js` (`ctx.plugin(<bridge>, …)`), so there are no absolute paths in the bundle patch and no `npx` child process — a 1.0.0 install works the same on any machine.

### From a checkout (development)

`plugin_manager` → `install_bundle` pointing at this directory. The bundle patch is a single row (`arya-computer-use`); the MCP lanes still mount in-process, so a checkout install and a registry install behave identically.

## Settings (Settings → Plugins → Computer Use)

| Setting | Default | Meaning |
| --- | --- | --- |
| Frame the app window | on | Rim only the driven window plus a banner; monitor edges are just the fallback before a target is known |
| Show a ghost cursor | on | Draw a synthetic cursor where the agent acts; your pointer is never followed |
| Agent name | `Arya` | Drives the ghost-cursor tag and the progress-panel header (`Arya · Step 3 · acting`), 1–16 characters |
| Banner text | `Arya is controlling your computer` | One line, 1–120 characters |
| Real mouse and keyboard | off | Opted-in headed input for one conversation: **every** action then drives the real pointer and keyboard. It releases on `session_end` and expires after 5 minutes. Text entry never needs it — `set_value` is headless; `type` is physical on its own. |
| One conversation drives at a time | on | Refuses desktop tools in other conversations while a drive is live |
| Progress panel detail | `summary` | What the on-screen step panel prints: `summary` = short action lines, `source` = the assistant's raw text stream (the old default — it paints model text on your desktop) |
| Stop shortcut | Esc | Global kill switch; synthetic keystrokes are ignored, so it needs a real keypress. It now also gates the driver: desktop input tools return `COMPUTER_USE_STOPPED_BY_USER` for that turn (reads keep working) |
| Tool preset | `lite` | `lite` lists all 22 desktop tools; `lazy` starts with tools/snapshot/click and reveals the rest on demand |
| Tool surface (web) | `core` | agent-browser tool profile: core 29, network 9, state 27, debug 40, tabs 13, react 8, mobile 15, webmcp 4, all 156 |
| Chrome profile / Session | – / `arya` | Reuse a Chrome login state and name the browser session |
| Connect to my browser | – | `--cdp` port or URL to attach to a Chrome you already have open |
| Saved sign-in state | – | Absolute path to a cookies+localStorage JSON to reuse |
| Show the browser window | off | `--headed` for the web lane |

## Web lane

The second MCP row (`arya_browser`, server `agent-browser`) runs through `mcp/browser-launcher.mjs`, a transparent stdio pipe that reads the control file and spawns the real server with the settings applied:

```
node mcp/browser-launcher.mjs          # → agent-browser mcp --tools core [--profile X] [--session Y] [--state Z] [--cdp ...] [--headed]
```

So sign-in reuse and attaching to your own Chrome are settings, not hand-edited rows. Web-lane changes land on the next MCP restart; the settings page says so.

## Plugin market

Installing from Plugins -> Arya Plugin Market needs no manual source: on first run the plugin registers
`https://cdn.jsdelivr.net/gh/KonnectSuite/dsh-arya-computer-use@main/index.json`
with the market (existing sources are kept) and every npm release shows up there as an update. Releases go
through npm staged publishing, so a publish is visible in the market once the version is approved on npmjs.com.

The plugin manager blocks dependency build scripts by default. The engines (`agent-desktop`, `agent-browser`)
fetch their native binary in a postinstall script; approve those two builds when installing, or let 1.0.1+
repair them itself at start-up - the status route reports the outcome under `mcp.engines`.

## Tool presets

- `lite` (default) — all 22 desktop tools listed up front.
- `lazy` — starts with `tools`, `snapshot`, `click`; everything else appears after `tools {operation:"load", names:[...]}`. The adapter advertises `tools.listChanged` and emits `notifications/tools/list_changed`, which DSH's MCP client re-syncs (`listChanged.onChanged → refreshTools`), so the new tools become callable immediately.

## License

MIT (KonnectSuite original code). Engines stay Apache-2.0 — see [NOTICE.md](NOTICE.md).


