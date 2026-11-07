# Arya Desktop — computer-use plugin plan (v1)

Status: complete plan for review. Engine = `dsh-arya-agent-desktop` (mirror of vercel-labs/agent-desktop v1.2.0, Apache-2.0). Replaces `dsh-computer-use-win` (wincu) completely.
Decisions locked by user (m00113): full move away from wincu (no coexistence) · Lite must cover app driving + OCR · headless default + per-conversation headed toggle · takeover UI parity (edge glow, status bar, Esc=kill, separate mouse) · publish as KonnectSuite package · safety guards = wincu parity.

## 1. What we are building

A Cordis bundle `@konnectsuite/dsh-plugin-arya-desktop` that gives DSH first-class computer use:

- **Native apps**: driven through Windows UIA via the `agent-desktop` Rust CLI — refs, not pixels. Measured on Windows: snapshot 117 ms, ref action 197 ms, list-apps 38 ms (probes/windows/FINDINGS.md:554). Headless = no pointer movement, no focus stealing.
- **Web pages**: driven through `agent-browser` (Vercel Labs sibling, `agent-browser mcp` stdio server, same ref model, CDP daemon, profiles/auth for sign-in keeping, `--cdp`/`--auto-connect` to attach to the user's real Chrome/Edge).
- **OCR**: agent-desktop has **zero OCR** (grep-confirmed). Our adapter adds `arya_ocr` = WinRT OCR (Windows.Media.Ocr) over a screenshot — same engine wincu uses, ported from its `scripts/windows-uia.ps1` approach (MIT).
- **Takeover UI parity**: edge glow + status bar + global Esc kill (PowerShell helper, adapted from wincu's `windows-takeover.ps1`) + agent-desktop's native **cursor overlay** = the "separate mouse": a presentation-only cursor (click-through topmost window, label pill, caret tracking) that animates to each target while the user's real mouse stays free.
- **Settings page + chat step rows** (wincu parity, English).

## 2. Architecture

```
DSH session ── Host plugin (adapter service)
               ├─ settings store (cordis.patch.yml row, wincu pattern)
               ├─ driver lock: one conversation drives desktop at a time
               ├─ takeover helper process (scripts/takeover.ps1: glow, status bar, global Esc)
               └─ loopback status endpoint (sidebar panel)
             ── official MCP bridge
               ├─ MCP row `arya_desktop` → node mcp/adapter-server.mjs   (our adapter)
               │    ├─ proxies agent-desktop CLI per call (spawns binary, injects --session/--agent-id/--headed)
               │    ├─ custom tools: arya_ocr (scripts/ocr.ps1 WinRT), arya_screenshot→file path,
               │    │   arya_tools (list/load/health/headed), batch guard
               │    └─ per-conversation agent-desktop session + cursor-overlay lifecycle
               └─ MCP row `arya_browser` → agent-browser mcp (web lane, sign-in profiles)
             ── Client plugin (Settings→Computer Use page, chat step rows, status panel)
             ── Skill row `arya-desktop` (observe-act loop, envelope, safety, Windows gotchas)
```

Key design facts this rests on (verified in deep dive):
- DSH mcp-client has **no tool filtering** — every server tool registers as `mcp__<serverName>__<tool>` and all schemas enter every request. Tool-surface control must be server-side → the adapter owns the tool list (wincu Lite-12 precedent).
- agent-desktop's MCP fixes global flags at server start (no per-call `--session/--headed`) → we do NOT use `agent-desktop mcp` directly; the adapter proxies the CLI and injects per-call flags. (Phase 0 spike may use raw `agent-desktop mcp` for evaluation only.)
- DSH keeps `structuredContent` programmatic-only (no double token cost); images enter context via attachment store; env scrubbing drops `*KEY|PASSWORD|SECRET|TOKEN*` + ambient `DSH_*` (AGENT_DESKTOP_* vars are safe to set in rows).
- engines pin `>=0.2.1-rc.3 <0.3.0-0` fits installed DSH 0.2.2-alpha.3.

## 3. Tool surface (adapter-owned, wincu-style presets)

Lite (default, 14) — superset of wincu Lite 12 (`list_windows, find, click, scroll, type_text, keypress, ocr, screenshot, wait_for, launch_app, batch, tools`):

| Our tool | Engine | Notes |
|---|---|---|
| arya_snapshot | desktop_snapshot | skeleton-first, `--root @ref` drill, `--timeout-ms` for Chromium |
| arya_find | desktop_find | role/text locators |
| arya_get / arya_is | desktop_get / desktop_is | element detail + state checks |
| arya_click | desktop_click | headless semantic |
| arya_set_value | desktop_set_value | headless text entry (preferred) |
| arya_type | desktop_type | headed SendInput (auto-requires headed) |
| arya_press | desktop_press | key chords; `ctrl+c` not `meta+c` |
| arya_scroll | desktop_scroll / scroll_to | |
| arya_list_windows | desktop_list_windows | + list_apps |
| arya_launch | desktop_launch | absolute path or System32 name |
| arya_wait | desktop_wait | ms/--element/--window/--text/--menu/--event |
| arya_screenshot | desktop_screenshot `--output` | returns PNG **file path**, bytes stay out of context |
| arya_ocr | custom (scripts/ocr.ps1, WinRT) | text + word coordinates (SCREEN coords) |
| arya_tools | adapter | list/load tools, health, headed toggle, session status |

Lazy preset: starts with `arya_tools` + snapshot + click (3), loads the rest on demand via `tools/list_changed` (verify DSH re-sync support in Phase 1; fallback = static Lite).
All preset: full agent-desktop surface (toggle/expand/collapse/select/check, drag, hover, mouse-click --xy, window mgmt, clipboard, notifications, displays, close-app, batch, cursor_overlay, trace) + web lane.
Web lane tools (second row `arya_browser` → `mcp__arya_browser__*`): open, snapshot, click, fill, press, read, get, tab, dialog, wait, screenshot, cookies, storage, profiles, state — agent-browser's surface, preset-filtered by the same Lite/Lazy policy where its MCP supports filtering (else accept its default set; verify count in Phase 3).

## 4. Session + headed model

- Host plugin tracks turns; **driver lock**: only one conversation drives the desktop at a time (wincu parity) + agent-desktop's cross-process interaction lock underneath.
- First desktop call in a conversation → adapter runs `agent-desktop session start` (with `--cursor` when overlay enabled) → session id; every call injects `--session <id> --agent-id <conversation-id>` → refs are namespaced per conversation (no cross-conversation collisions).
- Turn end / Esc / session end → `cursor-overlay disable` + `session end` (renderer self-reclaims ≤3000 ms; held input released via SIGTERM semantics).
- **Headless default.** Per-conversation toggle: `arya_tools {operation:"headed", on:true}` — adapter injects `--headed` for that conversation. Skill documents when headed is required: `type`, right-click, double/triple-click, focus, cursor-moving input, notifications, shell surfaces (start-menu/tray/action-center).
- State root: `AGENT_DESKTOP_HOME=%LOCALAPPDATA%\dsh-plugin-arya-desktop\state` (set in row env).

## 5. Takeover UI (parity checklist)

| wincu feature | Ours |
|---|---|
| Screen edge glow during physical input | takeover.ps1 helper (adapted, MIT) fed by adapter events |
| Status bar ("DSH is controlling…") | same helper; shows session + headed state |
| Pointer DSH tag | agent-desktop cursor overlay (separate mouse) + label pill per action (`--label` from step text) |
| Global Esc = kill | helper listens Esc directly → Host plugin: session end, overlay off, driver lock release, "stopped" status |
| Reasoning/progress overlay | client plugin chat step rows (human-readable rows from `mcp__arya_desktop__*` events) |
| Settings page | client plugin: preset (Lite/Lazy/All/Custom), headed default, overlay on/off, glow on/off, browser settings |

Overlay cost: ~355 ms per headless action (click 427→782 ms). Setting default: **overlay ON** (user wants the separate mouse); power users can disable for speed.

## 6. Safety guards (wincu parity + native)

- Elevated/admin windows: UIPI boundary fails closed natively (agent-desktop) — same practical effect as wincu's admin protection; UAC secure desktop unaddressable by both.
- Occlusion/hidden/disabled targets: agent-desktop actionability checks (stronger than wincu POINT_COVERED: identity corroboration immediately before each write; `AMBIGUOUS_TARGET` refuses identical twins instead of mis-clicking).
- Foreground borrow-and-return: adapter restores the user's foreground window after headed actions.
- Batch: native `desktop_batch` + adapter guard (1–20 steps, stop on first error/dialog/new-window, per-step delivery disposition).
- Blocked system shortcuts (alt+f4, win+l, alt+tab, …) refused natively without `--force`; `--force` not exposed by default.
- Delivery honesty: `delivered_verified / delivered_unverified / not_delivered` + `retry: safe|unsafe` — skill teaches: never retry unsafe; read `details.post_state`.
- Destructive-action gate (jev-inspired, in skill): model must `ask_user_question` before destructive steps (delete/send/uncheck-security) — confidence-style rule translated to DSH.
- Optional setting: require DSH approval for `arya_launch` / close-app / clipboard (off by default = wincu parity).

## 7. Packaging + install

- Repo `KonnectSuite/dsh-arya-computer-use` (created 2026-11-06, public, alongside the engine mirror).
- npm package `@konnectsuite/dsh-plugin-arya-computer-use`, Cordis bundle manifest:
  - Host entry: adapter service (settings store, driver lock, takeover helper spawn/teardown, loopback `GET /plugins/arya/status`).
  - Client entry: settings page + step rows + status panel.
  - Bundle patch: MCP rows `arya_desktop` (`command: node`, `args: [<adapter-server.mjs via packageDir !!js>]`) + `arya_browser` (`command: npx -y agent-browser@<pinned> mcp --session ...`) + skill row `arya-desktop`.
  - deps: `agent-desktop@1.2.0` (pinned; npm ships native win32 x64/arm64 binaries — no Rust toolchain needed), `agent-browser@<pinned>`.
  - scripts: `takeover.ps1`, `ocr.ps1` (standalone powershell.exe processes → FullLanguage, not affected by DSH pwsh sandbox).
  - `engines.dsh: >=0.2.1-rc.3 <0.3.0-0`.
- Install: `plugin_manager install_bundle` from git URL (npm publish later). First-run: settings page button runs `agent-browser install` (Chrome for Testing download).
- Migration: wincu stays installed during Phases 0–2; at Phase 3 acceptance, delete row `mcp-dsh-computer-use-win` from `cordis.patch.yml` and uninstall wincu.

## 8. Phases + acceptance

- **Phase 0 — eval spike (no plugin code, ~1 day)**: temp MCP row `npx -y agent-desktop@1.2.0 mcp` + stub skill. Drive Notepad, Explorer, Chrome, VS Code, Obsidian. Accept: user confirms speed + no pixel misses + Chromium settle handled (`--timeout-ms`). Kill row after.
- **Phase 1 — adapter server**: Lite 14, session injection, headed toggle, screenshot→file path, OCR helper, tools entry, skill row. Accept: drive Notepad/Explorer headless end-to-end; OCR reads a canvas app; Lite token footprint ≪ wincu All-26.
- **Phase 2 — takeover + UI**: Host/Client plugins, settings page, step rows, edge glow/status bar/Esc kill, cursor overlay lifecycle, driver lock. Accept: wincu-parity UX, English throughout, Esc stops everything in <1 s.
- **Phase 3 — web lane + retirement**: `arya_browser` row, sign-in profiles, attach-to-own-browser (`--cdp`), step-row parity. Accept: same web workflows user runs on wincu today. Then delete wincu row + uninstall.
- **Phase 4 — polish**: Lazy preset (after verifying `tools/list_changed` re-sync), notifications/clipboard/trace surfaces, npm publish, README + install docs.

## 9. Risks + mitigations

- WinUI3/MSIX menus "not detected" (native gap) → OCR fallback + headed `mouse-click --xy`; document in skill.
- Chromium cold trees read 13× thin (Obsidian 12 vs 165 nodes; settle 10–25 s) → skill mandates `--timeout-ms` + re-snapshot; covered Chromium windows hold the shell → fresh observation after waits.
- npm lifecycle scripts blocked in AryaCode's Node env → 1.0.2 launcher prints notice; verify binary linking in Phase 0; fallback = vendored binary download in postinstall of our package.
- DSH dynamic tool re-sync (`tools/list_changed`) unverified → Phase 1 spike; fallback = static Lite.
- Cursor overlay multi-monitor placement unit-tested only → test on user's monitors in Phase 2.
- 56-tool token cost in All preset → Lite default; Lazy when verified.
- agent-desktop cannot see UIs with no accessibility tree (some games/canvas) → OCR + headed coordinate fallback documented.

## 10. Open questions (non-blocking)

1. ~~Package name~~ **RESOLVED 2026-11-06**: repo `dsh-arya-computer-use`, npm `@konnectsuite/dsh-plugin-arya-computer-use`; MCP serverNames stay `arya_desktop` / `arya_browser`.
2. Cursor overlay default ON (visibility) vs OFF (speed)?
3. Lite list confirmation (14 tools above)?
4. Publish to public npm, or GitHub-install only?
