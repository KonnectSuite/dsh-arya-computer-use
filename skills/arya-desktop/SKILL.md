---
name: arya-desktop
description: Drive Windows desktop applications through semantic UIA refs (snapshot -> act -> verify) with the arya_desktop MCP tools: click, set_value, type, press, scroll, find, launch, windows, OCR fallback, batch. Use when asked to operate a native app (Notepad, Explorer, Office, Studio 5000, RSLogix, FTView, MotionWorks, any Win32/XAML window).
whenToUse: Any task that requires seeing or controlling a Windows desktop application.
---

# Arya Desktop — observe, act, verify

You drive Windows apps through `mcp__arya_desktop__*` tools. The engine reads
UIA trees and presses controls by their **semantic actions** — never pixels.
Screenshots are evidence, not input.

## The loop

1. **Observe** — `snapshot` the target window. Dense windows: `skeleton: true`
   or `compact: true` first, then `root: <ref>` to drill into the part you need.
   Chromium-based windows (Chrome, Electron, Obsidian, VS Code webviews) start
   thin and grow: pass `timeout_ms: 10000`–`25000` and re-snapshot after the
   first contact.
2. **Act** — one action on one ref: `click`, `set_value`, `type`, `press`,
   `scroll`. Prefer `set_value` for edits: it writes through the accessibility
   value pattern and never touches the pointer. `type` needs real keystrokes, so
   in the default background mode it only works on targets that accept
   synthetic text; when it fails, either use `set_value` or enable headed input
   for this conversation with `tools {operation:"headed",on:true}`.
3. **Verify** — re-`snapshot` (or `get`/`is` on the ref). The envelope tells
   you what happened:
   - `delivered_verified` — confirmed by readback.
   - `delivered_unverified` + `retry: unsafe` — engine cannot prove it; do NOT
     blind-repeat. Re-observe first.
   - `ACTION_FAILED` with `details.kind: post_action_verification` — the action
     LANDED, the readback differs. Read `details.post_state`; do NOT retry.
   - `STALE_REF` / `AMBIGUOUS_TARGET` — re-snapshot; refs die when the window
     changes. Identical twins (same control twice) refuse refs: pick with
     headed `click` at coordinates after `tools {operation:"headed",on:true}`.

## Rules that keep you safe

- **One action, then look.** Do not fire a chain of actions on a stale tree.
  When you must chain, use `batch` (1–20 steps, stops on first error, then
  observes once).
- **Elevation.** This host must run as Administrator. If you see
  `lease_directory_untrusted`, tell the user: restart AryaCode as Administrator.
- **Headed toggle.** Default is headless (no mouse/keyboard takeover): semantic
  UIA input goes straight to the control and never moves the user's pointer.
  When headless cannot do the job (cursor-moving input, notifications, start
  menu, tray, surfaces that reject background input), call
  `tools {operation:"headed",on:true}` for this conversation, then `on:false`
  when done. Headed input briefly focuses the target window and drives the real
  keyboard/mouse, so warn the user before switching it on.
- **Launch.** Bare names resolve only under System32 (`notepad` works,
  `chrome` does not). Use the absolute exe path. If many instances run, the
  engine refuses to guess — that is correct; ask the user.
- **Destructive actions** (delete, send, pay, submit, close unsaved work,
  kill processes) require the user's confirmation first.
- **No UIA tree** (games, canvas UIs, remote desktops): `ocr` reads text with
  screenshot pixel coordinates; headed clicks at those coordinates are the
  fallback. OCR hits are not refs.
- **Web pages are not in the UIA tree.** Chrome/Electron page content needs
  the `arya_browser` lane (agent-browser MCP) — use `mcp__arya_browser__*`
  tools for anything inside a web page.
- **Menus:** expand a menuitem (`click` on a `haspopup` item, or `expand`),
  then snapshot the menu surface. Win32/WPF/Chromium menus are detected;
  WinUI3/MSIX menus may not be — fall back to OCR + headed click.
- **End your turn clean:** when finished driving, call
  `tools {operation:"session_end"}` so the driver session and overlay release.

## Session & state

- Each conversation gets its own engine session automatically on first action
  (`tools` shows its id and state).
- Screenshots land in files (paths returned in results) — open them with the
  read tool when you need the picture.
- `tools {operation:"list"}` shows the tool surface and current state
  (session, headed, overlay).
