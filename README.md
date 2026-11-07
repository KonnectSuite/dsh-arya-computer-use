# Arya Computer Use

Computer use for [DeepSeek Harness / AryaCode](https://github.com/KonnectSuite): drive Windows desktop apps through **native accessibility refs** (UIA) instead of pixel coordinates, with a **takeover indicator** (edge glow, status bar, global Esc kill, presentation cursor) so the agent works in parallel with you on a separate mouse.

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

## Status

**Skeleton (v0.1.0).** Structure and install rows are in place; implementation follows the plan phases:

| Phase | Deliverable |
| --- | --- |
| 0 | Evaluation spike: raw `agent-desktop mcp` row, drive Notepad/Explorer/Chrome/VS Code/Obsidian, user acceptance |
| 1 | Adapter MCP server: Lite 14 tools, per-conversation session injection, headed toggle, screenshot→file path, WinRT OCR, skill |
| 2 | Takeover UI: edge glow + status bar + Esc kill, cursor overlay lifecycle, settings page, chat step rows, driver lock |
| 3 | Web lane (`arya_browser` row), sign-in profiles, attach-to-your-Chrome, **wincu retirement** |
| 4 | Lazy preset, notifications/clipboard/trace, npm publish |

Full plan: [docs/PLAN.md](docs/PLAN.md).

## Layout

```
package.json          Cordis bundle manifest (dsh.bundle.patch) + pinned engine deps
cordis.patch.yml      rows: arya-computer-use (Host), mcp-arya-desktop, mcp-arya-browser
index.js              Host plugin entry (Phase 1/2: settings, driver lock, takeover mgmt)
mcp/adapter-server.mjs  adapter MCP server (Phase 1: Lite 14 tool surface)
scripts/takeover.ps1  edge glow + status bar + global Esc (Phase 2)
scripts/ocr.ps1       WinRT OCR helper (Phase 1)
skills/arya-desktop/  observe-act loop guide (Phase 1)
locale/ icon.svg      Plugin Manager display metadata
docs/PLAN.md          complete v1 plan
```

## Install (dev, Phase 1+)

Not published to npm yet (`private: true`). Install from a local checkout with `plugin_manager` → `install_bundle` pointing at this directory. The `mcp-arya-desktop` row uses `npx -y @konnectsuite/dsh-plugin-arya-computer-use@0.1.0`; during development replace its `command`/`args` with `node` + the absolute path to `mcp/adapter-server.mjs` (the Loader `!!js` packageDir form is verified in Phase 1).

## License

MIT (KonnectSuite original code). Engines stay Apache-2.0 — see [NOTICE.md](NOTICE.md).
