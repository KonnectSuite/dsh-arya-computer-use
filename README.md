# Arya Computer Use

Computer use for [DeepSeek Harness / AryaCode](https://github.com/KonnectSuite): drive Windows desktop apps through **native accessibility refs** (UIA) instead of pixel coordinates, with a **takeover overlay** that frames the window being driven, shows what the agent is doing, keeps a synthetic ghost cursor where it acts (your own pointer is never followed), and stops on a global Esc. The agent calls itself **Arya** in that overlay by default, and the name is a setting.

Replaces [dsh-computer-use-win](https://github.com/Yu-tao-Li/dsh-computer-use-win) (wincu) completely — see [docs/PLAN.md](docs/PLAN.md) §7 for the retirement path.

## Why

| wincu complaint | Arya Computer Use |
| --- | --- |
| Slow (PowerShell + UIA backend) | Native Rust engine: snapshot ~117 ms, ref action ~197 ms on a Windows devbox |
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
| 1 | Adapter MCP server: Lite 16 tools, per-conversation session lifecycle, headed toggle + foreground promotion, screenshot→file path, WinRT OCR, skill | ✅ built, installed, driven in-host |
| 2 | Takeover UI: window rim + banner + Esc kill, configurable ghost cursor, settings page, chat step rows, driver lock, English UI | ✅ built + verified live |
| 3 | Web lane (`arya_browser` row), sign-in profiles, attach-to-your-Chrome, **wincu retirement** | planned |
| 4 | Lazy preset, notifications/clipboard/trace, npm publish | planned |

Lite 16 tool surface: `snapshot, find, get, is, click, set_value, type, press, scroll, list_windows, launch, wait, screenshot, ocr, batch, tools` (superset of wincu Lite 12; `set_value` fills a field through the accessibility value pattern without touching the pointer; `type` follows the input lane (background by default, real keyboard only when that conversation opts in); `tools` manages headed/overlay/session state).

Full plan: [docs/PLAN.md](docs/PLAN.md).

## Layout

```
package.json          Cordis bundle manifest (dsh.bundle.patch) + pinned engine deps
cordis.patch.yml      rows: arya-computer-use (Host), mcp-arya-desktop, mcp-arya-browser
index.js              Host plugin entry (settings, driver lock, takeover mgmt, status route)
client.js             Settings page + chat step rows (client plugin)
mcp/adapter-server.mjs  adapter MCP server (Lite 16 tool surface)
scripts/windows-takeover.cs  window rim + banner + progress + ghost cursor + global Esc
scripts/ocr.ps1       WinRT OCR helper (Phase 1)
skills/arya-desktop/  observe-act loop guide (Phase 1)
locale/ icon.svg      Plugin Manager display metadata
docs/PLAN.md          complete v1 plan
```

## Install (dev, Phase 1+)

Not published to npm yet (`private: true`). Install from a local checkout with `plugin_manager` → `install_bundle` pointing at this directory. The `mcp-arya-desktop` row is currently in **dev form** (`command: node`, `args: [<absolute path to mcp/adapter-server.mjs>]`); after npm publish replace with `npx -y @konnectsuite/dsh-plugin-arya-computer-use@<version>`. Keep the checkout in place while the dev row is active.

## Settings (Settings → Plugins → Computer Use)

| Setting | Default | Meaning |
| --- | --- | --- |
| Show screen edges and a banner | on | Frame the app window the agent drives, with a banner and the Esc offer |
| Show a ghost cursor | on | Draw a synthetic cursor where the agent acts; your pointer is never followed |
| Ghost cursor name | `Arya` | The tag drawn beside the ghost cursor, 1–16 characters |
| Banner text | `Arya is controlling your computer` | One line, 1–120 characters |
| Real mouse and keyboard | off | Opted-in headed input for one conversation; the background lane never moves the pointer |
| One conversation drives at a time | on | Refuses desktop tools in other conversations while a drive is live |
| Stop shortcut | Esc | Global kill switch; synthetic keystrokes are ignored, so it needs a real keypress |

## License

MIT (KonnectSuite original code). Engines stay Apache-2.0 — see [NOTICE.md](NOTICE.md).


