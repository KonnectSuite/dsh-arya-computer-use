# Arya Computer Use

Computer use for [DeepSeek Harness / AryaCode](https://github.com/KonnectSuite): drive Windows desktop apps through **native accessibility refs** (UIA) instead of pixel coordinates, with a **takeover overlay** that frames the window being driven, shows what the agent is doing, keeps a synthetic ghost cursor where it acts (your own pointer is never followed), and stops on a global Esc.

Replaces [dsh-computer-use-win](https://github.com/Yu-tao-Li/dsh-computer-use-win) (wincu) completely â€” see [docs/PLAN.md](docs/PLAN.md) Â§7 for the retirement path.

## Why

| wincu complaint | Arya Computer Use |
| --- | --- |
| Slow (PowerShell + UIA backend) | Native Rust engine: snapshot ~117 ms, ref action ~197 ms on a Windows devbox |
| Pixel alignment off | Ref-based semantic UIA â€” coordinates are never the targeting mechanism; identical twins are refused, not mis-clicked |
| Chinese UI/docs | English throughout |
| (kept) DSH integration + setup UI | Settings page, chat step rows, takeover overlay, Esc kill, tool presets |

## Engines (not vendored â€” pinned npm dependencies)

- [`agent-desktop`](https://github.com/vercel-labs/agent-desktop) `1.2.0` (Apache-2.0) â€” accessibility-tree computer use CLI, native Windows binaries on npm. Reference mirror: [KonnectSuite/dsh-arya-agent-desktop](https://github.com/KonnectSuite/dsh-arya-agent-desktop).
- [`agent-browser`](https://github.com/vercel-labs/agent-browser) `0.41.2` (Apache-2.0) â€” web lane via CDP (`agent-browser mcp`).

## Requirements

- **DSH host must run elevated (Run as administrator).** The engine's interaction lease lives at `C:\ProgramData\agent-desktop\<user-SID>\interaction.lock` with a protected DACL `{SYSTEM, Administrators, token user}`; a non-elevated medium-IL token fails validation (`lease_directory_untrusted`). The adapter surfaces this as an explicit "run AryaCode as administrator" hint.
- Accessibility permission (`desktop_status` reports `accessibility: granted`).
- Engine state root is the engine default `~/.agent-desktop` â€” do **not** point `AGENT_DESKTOP_HOME` at `%LOCALAPPDATA%` (inherited AppContainer ACEs fail the engine's private-DACL check).

## Status

**Phase 0 complete (accepted 2026-11-06); Phase 1 adapter built + smoke-tested.**

| Phase | Deliverable | Status |
| --- | --- | --- |
| 0 | Evaluation spike: raw `agent-desktop mcp` row, drive Notepad/Explorer/Chrome â€” speed âœ“, readable trees âœ“, refs-not-pixels âœ“ | âœ… accepted, spike removed |
| 1 | Adapter MCP server: Lite 16 tools, per-conversation session lifecycle, headed toggle + foreground promotion, screenshotâ†’file path, WinRT OCR, skill | âœ… built, smoke-tested; pending in-host install |
| 2 | Takeover UI: edge glow + status bar + Esc kill, cursor overlay lifecycle, settings page, chat step rows, driver lock | planned |
| 3 | Web lane (`arya_browser` row), sign-in profiles, attach-to-your-Chrome, **wincu retirement** | planned |
| 4 | Lazy preset, notifications/clipboard/trace, npm publish | planned |

Lite 16 tool surface: `snapshot, find, get, is, click, set_value, type, press, scroll, list_windows, launch, wait, screenshot, ocr, batch, tools` (superset of wincu Lite 12; `set_value` fills a field through the accessibility value pattern without touching the pointer; `type` follows the input lane (background by default, real keyboard only when that conversation opts in); `tools` manages headed/overlay/session state).

Full plan: [docs/PLAN.md](docs/PLAN.md).

## Layout

```
package.json          Cordis bundle manifest (dsh.bundle.patch) + pinned engine deps
cordis.patch.yml      rows: arya-computer-use (Host), mcp-arya-desktop, mcp-arya-browser
index.js              Host plugin entry (Phase 1/2: settings, driver lock, takeover mgmt)
mcp/adapter-server.mjs  adapter MCP server (Phase 1: Lite 14 tool surface)
scripts/windows-takeover.cs  window rim + banner + progress + ghost cursor + global Esc
scripts/ocr.ps1       WinRT OCR helper (Phase 1)
skills/arya-desktop/  observe-act loop guide (Phase 1)
locale/ icon.svg      Plugin Manager display metadata
docs/PLAN.md          complete v1 plan
```

## Install (dev, Phase 1+)

Not published to npm yet (`private: true`). Install from a local checkout with `plugin_manager` â†’ `install_bundle` pointing at this directory. The `mcp-arya-desktop` row is currently in **dev form** (`command: node`, `args: [<absolute path to mcp/adapter-server.mjs>]`); after npm publish replace with `npx -y @konnectsuite/dsh-plugin-arya-computer-use@<version>`. Keep the checkout in place while the dev row is active.

## License

MIT (KonnectSuite original code). Engines stay Apache-2.0 â€” see [NOTICE.md](NOTICE.md).


