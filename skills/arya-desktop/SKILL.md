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
   `scroll`. **Use `set_value` for every text entry**: it writes through the
   accessibility value pattern, headless, and never touches the pointer. `type`
   synthesizes real keystrokes — on Windows that is physical input, so it moves
   the pointer and briefly focuses the window. It is the last resort, only for
   an edit that rejects `set_value`.
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
  Headed is an **escape hatch for surfaces that refuse background input**
  (notifications, start menu, tray, right-click, drag, double-click). It is not
  the answer to a text field — `set_value` does that headless. Turning it on
  makes **every** action in this conversation physical: clicks move the real
  pointer, keystrokes go to the foreground window. So: warn the user before
  switching it on, call `tools {operation:"headed",on:false}` when the surface
  is done, and end with `tools {operation:"session_end"}`, which releases it.
  A latch left on also expires by itself after 5 minutes.
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
