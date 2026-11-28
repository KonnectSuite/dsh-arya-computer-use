---
name: arya-desktop
description: Drive Windows desktop applications through semantic UIA refs (snapshot -> act -> verify) with the arya_desktop MCP tools: click, select, check, toggle, expand, set_value, type, press, scroll, find, launch, windows, surfaces, OCR fallback, batch. Clicks and keystrokes run in the background and never move the user's mouse or take the foreground unless physical input is explicitly opted into. Use when asked to operate a native app (Notepad, Explorer, Office, Studio 5000, RSLogix, FTView, MotionWorks, any Win32/XAML window).
whenToUse: Any task that requires seeing or controlling a Windows desktop application.
---

# Arya Desktop — observe, act, verify

You drive Windows apps through `mcp__arya_desktop__*` tools. The engine reads
UIA trees and presses controls by their **semantic actions** — never pixels.
Screenshots are evidence, not input.

## The loop

1. **Observe** — `snapshot` the target window. Omit `app`/`window_id` to read
   the window this conversation last touched; the adapter scopes it for you and
   says so in `data.scoped_to`. Do not scan the whole desktop — it is slow and
   it matches other apps, including AryaCode's own windows.
   Dense windows: `skeleton: true` or `compact: true` first, then `root: <ref>`
   to drill into the part you need. Chromium-based windows (Chrome, Electron,
   Obsidian, VS Code webviews) start thin and grow: pass
   `timeout_ms: 10000`–`25000` and re-snapshot after the first contact.
   A snapshot that reports `identity_unproven: true` or `complete: false` is a
   **partial read**: every ref action on it will refuse with
   `AMBIGUOUS_TARGET` / `identity_not_unique`. Do not retry the action — take a
   fresh snapshot of the same window with `timeout_ms: 10000`–`20000` first.
2. **Act** — one action on one ref: `click`, `select`, `check`/`uncheck`,
   `toggle`, `expand`/`collapse`, `set_value`, `clear`, `scroll`, `scroll_to`,
   `focus`. **Prefer the action the control advertises** (`available_actions`
   in the snapshot): `select` names an option, `check` sets a box without
   toggling it off, `expand` opens a tree node — each is one headless call and
   none of them touches the pointer.
   **Use `set_value` for every text entry**: it writes through the
   accessibility value pattern, headless, and never touches the pointer.
   `type` is quiet too: the adapter first writes the value pattern on the ref,
   then posts the characters as `WM_CHAR` to the control hit-tested from that
   ref's own live rectangle, and confirms by reading the value back. If the
   read-back shows the characters did **not** land (a XAML/WinUI/Electron
   control ignores `WM_CHAR`), then with `physical: true` it synthesizes
   keystrokes in the same call (moves the pointer, focuses the window); without
   consent it reports `not_delivered` — use `set_value` or pass `physical: true`.
   Never pass `physical: true` for text on the first try; `data.mechanism` says
   which rung landed (`value_pattern` or `post_message`).
3. **Verify** — re-`snapshot` (or `get`/`is` on the ref). The envelope tells
   you what happened:
   - `delivered_verified` — confirmed by readback.
   - `delivered_unverified` + `retry: unsafe` — engine cannot prove it; do NOT
     blind-repeat. Re-observe first. The same rule governs a TIMEOUT whose outcome is
      uncertain — a button that opens a modal dialog answers `UIA_E_TIMEOUT`
      *after* the dialog is already open: the adapter stops the click ladder
      there instead of trying another pattern or posting another click, because
      either would fire the same handler twice (a duplicate dialog, a double
      increment). `list_windows` / `list_surfaces` first, then act on the read.
   - `not_delivered` + `retry: safe` with `details.kind: posted_no_effect` — a
     posted click/key/character produced **no observable effect**: nothing
     happened. This is the honest failure the old ladder masked as
     `delivered_unverified`. You may retry, or pass `physical: true` to escalate
     to real input (the window is brought forward). `right_click` checks for a
     new menu surface, `double_click` a new window/surface, `type` the value
     read-back — when the adapter sees the effect it reports `delivered_verified`.
   - `ACTION_FAILED` with `details.kind: post_action_verification` — the action
     LANDED, the readback differs. Read `details.post_state`; do NOT retry.
   - `STALE_REF` / `AMBIGUOUS_TARGET` — re-snapshot; refs die when the window
     changes. A ref the engine could not prove unique is a **read problem**, not
     a delivery problem: narrow the read (`root: <ref>` on the container, `find`
     with `exact: true`, or a longer `timeout_ms`) so the next snapshot yields a
     unique ref. There is no coordinate-click path in this plugin — adding one
     is the defect this plugin exists to remove.

## Dialogs and menus are surfaces

A modal dialog and an open menu are **not part of the window tree**. A window
snapshot of an app with a dialog up shows the blocked parent and nothing else,
and every ref action on that parent fails while the dialog owns the thread.

- `list_surfaces {app}` inventories what the app actually owns: `window`,
  `focused`, `sheet` (its modal dialog) and `menu` (an open menu, with
  `item_count`). A surface that already closed answers `WINDOW_NOT_FOUND` —
  that is confirmation it closed, not an error to retry.
- Read the dialog with `snapshot {surface: "sheet"}` (or `find {surface: "sheet",
  name: "Save"}`), and an open menu with `surface: "menu"`. Shell surfaces
  (`start-menu`, `taskbar`, `system-tray`, `system-tray-overflow`,
  `action-center`) are read the same way and need no `app`.
- A failed ref action carries `error.details.blocking_windows` naming the
  window that appeared. Drive the dialog by reading it with `surface: "sheet"`
  and clicking a ref from **that** tree: while the modal owns the thread a
  `find` by the dialog's own `window_id` does NOT answer (measured
  `locator_transient_incomplete`), and the adapter raises the read and the
  action budget for a surface-discovered ref automatically.
- When that read is too slow or returns no tree, `press` the key with the
  dialog's own `window_id`. Measured: the key lands on the **dialog box itself**
  (its focused control is a button, and a button ignores a posted key), so
  `enter` fires the default button and closes it — the adapter then confirms the
  window is gone and reports `delivered_verified`. `escape` only lands on a box
  that HAS a Cancel button: a YesNo or OK box ignores it exactly as it ignores a
  physical Escape, and the result says so (`dialog_window_gone: false`) instead
  of claiming a dismissal.
- A read can also fail **silently**: `find` / `snapshot` of a window a dialog
  owns answers `ok` with nothing in it (measured: `find {name: "FileMenu"}`
  returned no match at all with a MessageBox up). The adapter then names the
  other window in `data.blocking_windows` and explains it in
  `data.observation_note`. An empty result there is **not** "the control is
  missing": read the named window. If nothing is named, the name or role you
  searched for really is absent — say so instead of re-reading at a bigger
  budget. A surface read that answers `WINDOW_NOT_FOUND` with *"no longer the
  focused window"* means the app has no focused window: read that window by its
  own `window_id`, or drive it blind with `press {combo: "escape"}` on its id.
- Catch the appearance without polling: `wait {event: "window-opened"}` or
  `{event: "surface-appeared"}` needs no id, `wait {menu: …}` /
  `wait {menu_closed: …}` waits on a menu, and `snapshot`/`find` take
  `wait_for` / `wait_for_gone` so the wait happens in the same call.
  **Repeated `screenshot` or `list_windows` polling is the symptom of a surface
  you have not read.** A `wait {ms: 20000}` is never an answer.
- A `wait {text: …}` can answer `AMBIGUOUS_TARGET` when several windows of the
  app qualify (a document and its save dialog): narrow with `app`, or use
  `event` — `window_id` does not narrow a text wait.
- A text wait sees a value that **just changed** only ~2 s into the wait (five
  1500 ms waits for a label that already read `status=delayed-done` all timed
  out; a 6000 ms wait found it at 2069 ms). So give it `timeout_ms >= 4000`, or
  confirm the change by reading the control — `find {name: …}` / `get
  --property value` answer fresh in ~200 ms. A sub-2 s text wait is a coin flip
  that usually fails, and that is what a `wait {ms: …}` sleep grows out of.
- Minimized windows: every element reports `offscreen` and ref actions fail.
  `restore_window {window_id}` first — no pointer movement, no foreground steal.

## How a click is delivered

`click` picks the delivery rung itself, in this order, and tells you which one
it used in `data.mechanism`:

| mechanism | what happened | pointer / foreground |
| --- | --- | --- |
| `semantic` | the control ran its own UIA pattern (Invoke or Legacy default action) | untouched |
| `select` / `toggle` / `expand` / `collapse` | the click was refused, the control's own advertised action did the job | untouched |
| `post_message` | a mouse message was posted straight to the control's window | untouched |
| `physical_synthetic` | real OS input (the engine's headed command / SendInput) — only with `physical: true`, and only after the quiet rungs failed or had no observable effect | moves both |

So a click on a background window normally lands without the user's cursor
moving. When it lands by fallback and could not be verified, the result says
`delivered_unverified` and carries `data.fallback_from` (why the semantic rung
refused) — **re-read the control to confirm** instead of clicking again.

`expand`/`collapse`/`toggle` answer the same way: when the engine's pattern is
refused the adapter posts a background click for that control.

`press` tries the engine headless first (the foreground queue, which fails
closed for a non-frontmost app). With `physical: true` it brings the window
forward and synthesizes a real keystroke — the **only** way a modifier chord
(`ctrl+s`, `alt+f4`) reaches a background window. Without consent a plain key
posts in the background (`WM_KEYDOWN`/`WM_KEYUP`, mechanism `post_message`, a
bare letter arrives lower-case) and a modifier chord reports `not_delivered`.

`double_click` and `right_click` are posted in the background by default; the
adapter then checks for the effect — a new menu surface for `right_click`, a new
window/surface for `double_click` — and reports `delivered_verified` when it sees
one. With `physical: true` a posted click with no observable effect — or one that
could not be posted because the control exposes no live bounding rectangle (common
on WinUI/XAML) — escalates in the **same** call to the engine's own headed
`right-click`/`double-click`, which resolves the clickable point internally and
brings the window forward; without consent it reports `not_delivered`. A WinUI
context menu appears as a `PopupHost` window, so read it with `list_surfaces`.
`focus` and `focus_window` are physical by nature (Windows SetFocus/foreground),
so both require `physical: true` and say so when they refuse.

**Delivery honesty.** A posted message only proves the queue took it, not that
the app acted. Judge delivery by observing the app, never by the return code:
`delivered_verified` means an effect was observed, `delivered_unverified` means
re-read before deciding, `not_delivered`/`retry: safe` means nothing happened and
you may retry or escalate to `physical: true`.

## Rules that keep you safe

- **One action, then look.** Do not fire a chain of actions on a stale tree.
  When you must chain, use `batch` (1–20 steps, stops on first error, then
  observes once). A native batch of five reads costs ~110 ms where five separate
  calls cost ~2.2 s — batch the work you have already decided on.
- **Elevation.** This host must run as Administrator. If you see
  `lease_directory_untrusted`, tell the user: restart AryaCode as Administrator.
- **The user's mouse and keyboard are not theirs to give away twice.** Nothing
  moves the pointer or takes the foreground unless you opt in: `physical: true`
  on one call, or `tools {operation:"headed",on:true}` for the whole
  conversation (5 minutes, cleared by `session_end`). Physical input is the
  **last** rung, used when the posted input failed OR produced no observable
  effect — re-read first, then opt in. It is never the answer to a `STALE_REF`,
  an `AMBIGUOUS_TARGET`, a refused pattern, a timeout, or text on the first try:
  those are not delivery problems and physical input cannot fix them. Warn the
  user before you opt in.
- **A busy interaction lease is not a failure of your click.** Only one engine
  action can drive the desktop at a time, and `launch` holds that lease until
  the new window settles (up to its `timeout_ms`, 30 s by default). Right after
  a launch you may see `TIMEOUT` / `details.kind: "lock_timeout"`; `click`
  answers it with a posted click, and every other action retries the engine twice
  with backoff (800/1600/3200 ms) before it reports contention, so a
  `lock_timeout` that reaches you means the lease stayed busy. Pass a smaller
  `timeout_ms` to `launch` when the window appears quickly.
- **Launch.** Bare names resolve only under System32 (`notepad` works,
  `chrome` does not). Use the absolute exe path. `launch` attaches to a running
  instance; several instances of one name is `AMBIGUOUS_TARGET` with no pid
  flag — drive the instance by its `window_id` instead of launching again.
- **Destructive actions** (delete, send, pay, submit, close unsaved work,
  kill processes) require the user's confirmation first.
- **No UIA tree** (games, canvas UIs, remote desktops): `ocr` reads text with
  screenshot pixel coordinates, and that is all this lane offers there. There is
  no coordinate-click tool by design, so an app with no tree cannot be driven by
  input — say so instead of inventing a pixel path.
- **Web pages are not in the UIA tree.** Chrome/Electron page content needs
  the `arya_browser` lane (agent-browser MCP) — use `mcp__arya_browser__*`
  tools for anything inside a web page.
- **Saved browser flows:** the web lane also exposes `flow_list`, `flow_save`,
  `flow_run` and `flow_steps`. A flow is a named sequence the engine stores per
  origin — running one is a single call instead of re-driving each step. Saving
  and running are engine-side writes the engine may gate behind its own
  confirmation (`flow_write:<id>`); never reach for `--allow-write`.
- **Menus:** open one with `click` on a `haspopup` item, then read it with
  `list_surfaces` / `snapshot {surface: "menu"}` and act on its refs. Win32 /
  WPF / Chromium menus are detected; WinUI3/MSIX menus may not be — then the
  honest options are `ocr` to read it, or physical input with the user's consent
  as the last resort.
- **End your turn clean:** when finished driving, call
  `tools {operation:"session_end"}` so the driver session and overlay release.

## Session & state

- Each conversation gets its own engine session automatically on first action
  (`tools` shows its id and state).
- Screenshots land in files (paths returned in results) — open them with the
  read tool when you need the picture. The folder keeps its newest few hundred
  shots and drops anything older than a week; it is not an archive.
- `tools {operation:"list"}` shows the tool surface and current state
  (session, headed latch, overlay); `tools {operation:"describe"}` with no name
  describes the whole surface.
