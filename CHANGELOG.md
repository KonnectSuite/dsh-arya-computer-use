# Changelog

All published versions of [Arya Computer Use](https://github.com/KonnectSuite/dsh-arya-computer-use), newest first.
Release notes for every version also live on the [Releases page](https://github.com/KonnectSuite/dsh-arya-computer-use/releases); dates are the npm publish times.

## 1.0.15 — 2026-11-23

**This is the release that answers the first long real drive.** A full working day audited against the 1.0.14 lanes produced three complaints — the mouse cursor got taken over, dialog popups were handled badly, clicks were slow and unreliable — and everything below is the fix set for them, verified against the full QA battery (202 checks, cursor-watch sampling throughout). The engines are unchanged: `agent-desktop` 1.3.1 and `agent-browser` 0.43.0 stay pinned; this is all adapter, skill, and copy.

**The desktop lane goes from 28 to 30 tools.** `list_surfaces` and `restore_window` are new. `lite` lists 30; the lazy core is now `tools / snapshot / find / list_surfaces / click`. The chat-step rows narrate both new tools (*Looked for dialogs and menus*, *Restored a minimized window*) in en and zh — all 64 lane keys (30 desktop + 34 web) are covered.

**Dialogs and menus are surfaces, not part of the window tree.**
- `list_surfaces` inventories each process: windows, focused windows, modal sheets, open menus and their item counts; `snapshot` and `find` take `surface: "sheet" | "menu" | "focused"` and read the surface's own tree. A dismissed surface answers `WINDOW_NOT_FOUND` — that is confirmation, not an error.
- While a modal owns the UI thread, a ref action on its blocked parent answers `owner_blocked` and names the blocker in `error.details.blocking_windows`; a repeated attempt answers from a memo in 0 ms (measured: the first blocked attempt pays the engine budget once — 16,530 ms — the repeat is a 0 ms memo hit). A read that comes back empty behind a modal is flagged as blinded: `data.blocking_windows` names the other window and `data.observation_note` says an empty read there is not a missing control — read the *named* window instead. "No match" can no longer be misread as "the control is gone"; the screenshot/`list_windows` polling loop the audit produced (55 screenshots, 53 window listings in one series) is precisely what this removes.
- Keys follow the box: `enter` fires the default button, `escape` is posted only to boxes that have a Cancel (a posted Escape on a Yes/No box is a no-op — measured, and the refusal now says so), and a key that dismisses a box carries `dialog_window_gone: true`. The recipe for a **non-default** dialog button is the ref path, not a key trick: read the dialog with `surface: "sheet"` and click the button's ref (measured: a Yes button found that way dismissed a modal and the app reported its own answer). Keys do not reach a non-default button — a posted arrow does not move a message box's selection, and a posted mnemonic letter landed without actuating it (`press "n"` on a Yes/No box, 406 ms, the box survived) — and the refusal's suggestion names the sheet read instead. `wait` gained `event: window-opened | window-closed | app-launched | app-terminated | focus-changed | surface-appeared | surface-dismissed`, plus `menu` / `menu_closed` conditions.

**Clicks no longer touch the mouse.** `click` climbs a ladder — the engine's semantic click → the control's own advertised action (`select`/`toggle`/`expand`/`collapse`) → a background posted `WM_*` click (new `mcp/quiet-input.mjs` + `scripts/quiet-input.ps1`, pixel-exact, `cursor_moved: false`, `foreground_changed: false`) — and a physical click is the **last** rung, gated on consent, and consent only skips to it once the posted rung is the one that just failed. Every result names the rung it used in `data.mechanism`. Measured across the battery with cursor-watch running: 12,297 cursor samples, 40 pointer jumps over 250 px and 25 foreground changes — **zero attributable to a plugin call**. `type` is quiet too: value pattern on the ref, then posted `WM_CHAR` hit-tested from the ref's own live rectangle and confirmed by reading the value back; keystroke synthesis is last and, with consent, raises the window through `focus-window`, never a click at the element centre. `press` posts `WM_KEYDOWN`/`WM_KEYUP` to the control the thread already has focused when the engine cannot confirm focus (`data.key_target` names where the key went).

**An uncertain action does not fire twice.** When an engine mutation times out with an outcome that may still have happened (measured: `UIA_E_TIMEOUT` at 29,760 ms on a modal opener that was in fact blocking), the ladder stops instead of climbing to the posted rung: the answer states the outcome is uncertain, carries disposition `retry-unsafe`, and points at the read that resolves it. In the battery the timed-out click was never re-fired and the dialog opened exactly once.

**Observations are scoped, and the queue is the only serializer.** `snapshot` and `find` default to the app of the window this conversation last touched — `data.scoped_to` names the scope (measured: 527 ms scoped vs 2,424 ms desktop-wide, and an unscoped scan matches *other* apps' windows, including the agent's own, which is what made the audited session spend a series driving its own UI). The takeover overlay's own `list-windows`/`get-bounds` calls now run inside the per-conversation queue; they used to race the engine's exclusive interaction lease against the next queued action, which is what produced the 21 s and 42 s click tails. Those tails are gone: measured semantic click 298–558 ms, snapshot 204–287 ms, scoped find 207–696 ms, a text `wait` returning in 1,459→2,019 ms instead of 20 s of sleeps, `restore_window` 205 ms then a semantic click 562 ms.

**Skill and docs.** `skills/arya-desktop/SKILL.md` teaches the new loop — surfaces before screenshots, wait conditions before sleeps, the no-re-fire rule on delivery uncertainty, scoped reads, restore before acting on a minimized window. Both READMEs gained the section *Dialogs and menus are surfaces*.

**Fixed.**
- A refused or blocked action no longer pays ~6 s of overlay reads for a window the action never reached — the overlay's target note is now guarded and enqueued.
- The settings copy follows the 30-tool surface (the preset hint and the `index.js` schema both say 30 with the five-name lazy core), and the Control-style hint tells the truth about the ladder: text is quiet (value pattern or posted `WM_CHAR`), and physical covers `focus`/`focus_window` plus a click or type whose quiet rungs did not land.

## 1.0.14 — 2026-11-21

**Engines.** `agent-browser` 0.41.2 → **0.43.0**, `agent-desktop` 1.2.0 → **1.3.1** (the rustix security fix, RUSTSEC-2026-0486 / agent-desktop#670). `engines.node` is now `>=22`, which is what agent-browser 0.43.0 itself requires.

- **The web lane follows the engine's new packaging.** 0.43.0 removed the native binaries from the package: `bin/agent-browser.js` is now only a shim, and the binary arrives as an **optional platform package** (`@agent-browser/cli-win32-x64-msvc` and friends). The 1.0.12 readiness scan of `agent-browser/bin/` therefore reported a healthy install as *missing*, and the beside-the-shim rule found nothing. `nativeBin()` now resolves the way the engine's own `scripts/native.js` does — `createRequire` anchored at the engine's `package.json` — and spawns the native directly; it reports which route it took (`package-bin` / `platform-package`). Measured on this machine: the launcher resolves `…\@agent-browser+cli-win32-x64-msvc@0.43.0\node_modules\@agent-browser\cli-win32-x64-msvc\bin\agent-browser.exe`, mode `platform-package`. The shim's daemon spawn — the issue #2 console window — is no longer in our process chain at all. `index.js` uses the same resolver, so `mcp.engines` no longer calls a good install broken. The console watcher's path pattern was widened to cover the flat *and* the pnpm virtual-store layout; it stays a watchdog, not the fix.
- Only `agent-desktop` needs an approved build script now — agent-browser's native is a plain optional dependency. `pnpm install` still prints `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: agent-browser@0.43.0`; the platform package installs regardless.

**Web-lane settings that actually reach the engine.** New: **Allowed domains**, **Browser idle timeout**, **Browser namespace**, **Custom CA file** / **Use system CA**, **Browser call timeout**, **Confirmation actions**. `--idle-timeout`, `--namespace`, `--ca-cert`, `--use-system-ca` and one `--confirm-actions` per pattern are passed by the launcher; domains go through `AGENT_BROWSER_ALLOWED_DOMAINS`, because that is the only route that enforces — measured on the pinned native, a daemon started with `--allowed-domains example.com` still opened wikipedia, while the same daemon with the env var answered `Domain 'www.wikipedia.org' is not in the allowed domains list`. The engine also refuses a per-call `allowedDomains` argument once the host sets the env: host-wide wins, by design. There is no `--timeout` in `mcp` mode, so the call ceiling goes through `AGENT_BROWSER_DEFAULT_TIMEOUT`. `webmcp` is now an accepted tool profile.
- The tool-surface copy tells the truth, measured through our own launcher against 0.43.0: **core 33 tools, 24,594 B of schema, 60 argument keys; `strip` removes 52 of those key occurrences and leaves 17,793 B (≈ 1.7k tokens per conversation)**. Profiles: core 33, network 9, state 27, debug 40, tabs 13, react 8, mobile 15, webmcp 4, **all 160** — the "all 156" in these docs was wrong, and the earlier "all 64" in our notes was an unpaginated first page.
- Domains need a fresh browser context (engine constraint), so the page says to clear *Chrome profile* and *Session* before setting them.

**Desktop knobs.** *Engine call ceiling* (150000 ms), *Lease retry base* (800 ms, doubling) and *Screenshot folder* were compiled-in constants; they are settings now, re-read per call and range-checked rather than trusted. The host's MCP tool-call ceiling was raised to 315 s so it sits above the adapter's own timeout — otherwise the host killed the call and the envelope that names the timeout and what to do about it never reached the model.

**Settings page rebuilt on the host's own kit.** The page is built entirely from `@deepseek-ai/dsh-client-ui-primitives` — the same `SettingsForm` / `SettingsFormModel` kit the host's own cards use — so drafts stage against the live config, an invalid field is marked inline and blocks *Save*, anything you changed carries an *Overridden* tag with *Reset*, and writes are revision-fenced. The layout is the app's own visual language — a header with the version and package chips, a pill tab strip (**Desktop lane · Takeover indicator · Progress overlay · Web lane · Status**), and inside each tab bordered, icon-headed cards in the host's colors (Engine session / Call limits / Stop and resume; Indicator; Overlay / Position & size; Launch / Network & policy / Tool surface) whose rows sit on a two-column grid. The 1.0.12 page's hand-drawn SVG arts are back — the driven-window monitor with the accent rim, the ghost-cursor pill, the Esc keycap, the overlay card, the padlock, the shield, the keyboard — each mirroring its toggle's state — and every labelled field carries an ⓘ whose hint opens in the kit's own tooltip. The only feature-owned CSS is a stylesheet scoped to the settings card: tokens mapped onto the host's, the art strokes, the grid — and no generic element rules, so kit controls keep their own styling. Numbers sit in compact right-aligned inputs the way General's font-size row does; *Banner position* and *Overlay position* are picked with glyph cards (↑ ↓ / ↖ ↗ ↙ ↘ ⌖) the way General picks Appearance. Paths stop being typed by hand — *Screenshot folder* and *Chrome profile* open the host's directory dialog; *Saved sign-in state*, *Custom CA file* and *Browser executable path* pick the containing folder first, then the file from a filtered list (the harness exposes a directory dialog and nothing else, and the page says so instead of pretending otherwise); *Browser executable path* also gets a **Detected browsers** menu, fed by a new status-route probe of the standard Edge / Chrome / Brave / Chromium install roots. *Stop shortcut* and *Overlay unlock shortcut* are **recorded, not typed**: press the chord while recording and it is captured; empty means Esc only. **Status** is three stat cards — browser lane, desktop lane, this session — with the live facts in monospace (resolved native and mode, tool counts, flags and env actually applied, elevation, whether the lease root exists; the lease probe is read-only and never touches `interaction.lock`), and a **Resume** button that appears only while a stop is in effect. A collapsed *Technical details* holds the raw status JSON with a copy button. The web-lane tool menu labels carry the measured counts (core 33 … all 160). Hosts without the component catalog fall back to a plain form over the same write ladder, so the settings and the chat step rows stay usable either way. English and Chinese strings for everything new.
- `Progress panel detail` was unreachable: the host schema was `z.const('source')`, so `summary` — the default in the settings bridge and the README — could never be saved. The schema is a union of `source`/`summary` now, default `summary`, and the page offers both as a segment control.

**Fixed.**
- **A control file saved with a UTF-8 BOM silently reset every setting.** Notepad and `Set-Content` write one by default on Windows; `JSON.parse` threw, every reader caught it and returned defaults, so user edits did nothing and nothing said so. All control-file readers now strip the BOM before parsing.
- **17 tools had no step row in the conversation**: 12 desktop (`check`, `uncheck`, `toggle`, `expand`, `collapse`, `scroll_to`, `select`, `focus`, `focus_window`, `double_click`, `right_click`, `clear`) and 5 web (`flow_run`, `flow_save`, `flow_list`, `flow_steps`, `tools_profiles`). The step feed registers 62 lane-prefixed keys (28 desktop + 34 web); the replay at `KonnectSuite/.tmp-verify/toolview-keys.mjs` asserts no bare key, no collision, and full coverage of both lanes' exposed tools — the rule-9 check that issue #1 exists to keep honest.
- The adapter's stale "all 16 tools" comment reads 28, matching the real surface.

## 1.0.13 — withdrawn (2026-11-21)

Withdrawn by the maintainer the day it was published: the settings page it shipped was rejected on review, and the version never reached the market index. `latest` was returned to 1.0.12 and 1.0.13 deprecated on npm ("withdrawn by the maintainer before release — settings UI rejected; install 1.0.12"). Every engine, adapter and fix change from that build ships in 1.0.14 together with a settings page rebuilt on the host's own component kit — the 1.0.14 notes are the record.

## 1.0.12 — 2026-11-19

- **The web lane now spawns agent-browser's native binary directly** (issue #2, reported by shuning0128). `nativeBin()` looked for the executable at the **package root**, but `agent-browser` ships every native beside `bin/agent-browser.js`, so the lookup never matched and the launcher fell back to the npm shim on every run. The shim spawns the daemon with `stdio:'inherit'` + `windowsHide:false`, and Windows gives a console window to a console process that inherits none — so a black `agent-browser-win32-x64.exe` window appeared on the desktop at every startup, hidden a few seconds later by this plugin's own console watcher. Present in every release since 1.0.3.
- The native is resolved **beside the shim** (`dirname(SHIM)`), the directory the shim itself resolves `join(__dirname, binaryName)` from, so the path tracks the package layout instead of assuming one.
- Same-class gaps closed while there: musl libc (Alpine) now resolves `agent-browser-linux-musl-<arch>` exactly as the shim decides it, the `x86_64`/`aarch64` arch aliases are accepted, and the win32-arm64 → x64 fallback checks the directory it will actually spawn from (that native is not shipped, so the fallback is what runs).
- The shim's defensive exec-bit repair (`chmod 0o755` when a postinstall did not run) is carried over to the native spawn, on the platforms where it can matter.
- A shim fallback is no longer silent: the launcher writes one stderr line naming the platform when it finds no native binary. Measured on this machine: the fixed launcher's direct child is `agent-browser-win32-x64.exe` and that daemon owns **zero** console windows, while the installed 1.0.11 chain (`launcher → agent-browser.js shim → agent-browser-win32-x64.exe`) still carries its window, hidden by the watcher.

## 1.0.11 — 2026-11-17

- New setting **Browser executable path**: an absolute path to `msedge.exe`, `chrome.exe`, `brave.exe` … that the web lane launches when it starts its own browser. Reported by shuning0128 in [issue #1](https://github.com/KonnectSuite/dsh-arya-computer-use/issues/1): agent-browser's auto-launch checks its own download cache and system Chrome only, so a machine with Edge and no Chrome gets `Auto-launch failed: Chrome not found`. Empty keeps the old behaviour.
- The path reaches the daemon as the `AGENT_BROWSER_EXECUTABLE_PATH` env var on the daemon spawn. Measured on this machine (agent-browser 0.41.2): in `mcp` server mode the daemon **ignores** the `--executable-path` flag (both argument positions opened its own Chrome) and honors the env var instead (msedge process count 5 → 21, clean page open); in CLI mode the flag works in either position. The flag is still passed for CLI-mode runs, but a daemon command line carrying it is not proof the path took effect.
- The setting validates as an absolute path in the settings page and in the host schema.

## 1.0.10 — 2026-11-17

- Tool views are keyed per lane: desktop tool names take the `mcp__arya_desktop__` prefix, web-lane names take `mcp__arya_browser__agent_browser_` — 45 unique wire-name keys, no bare key, no duplicate.
- Fixes [issue #1](https://github.com/KonnectSuite/dsh-arya-computer-use/issues/1): the renderer startup error `keyed slot "tool.call.toolview" already has an entry for key "read" at priority 0`. The previous code registered every tool name under three prefixes including an empty one, and the bare key `read` collides with the shipped read-tool card. The collision is reported by shuning0128, whose disable/re-enable A/B isolated it to this plugin.
- The hidden half of that bug: the registration is a generator, so the throw aborted every later key — only 8 of the 29 web-lane rows had ever registered, the other 21 silently fell back to the generic card. All desktop-lane rows landed, which is why the UI looked unaffected.
- The cross-product registration (every prefix × every name) is gone: it also registered keys no wire call can ever have, and the six names shared by the two tool tables registered the same key twice.
- A/B verified on Dev AryaCode in one profile: 1.0.9 logs the reported line verbatim, 1.0.10 logs zero.

## 1.0.9 — 2026-11-14

- A refused engine action — `lock_timeout` on the exclusive desktop interaction lease — is retried twice with backoff (800/1600/3200 ms) before the adapter answers, so one `launch` in flight no longer turns the next action into a TIMEOUT.
- Applies to `set_value`, `select`, `check`, `uncheck`, `clear`, `toggle`, `expand`, `collapse`, `scroll_to`, `scroll`, `press`, and the click alternatives.
- Posted-click notes now say the adapter left the pointer alone while the app may take focus itself — read `data.pointer.foreground_changed` instead of assuming.
- Measured, not asserted: holding the lease for 8 s from a second process, `set_value` returned `delivered_verified` after 8036 ms and the value read back.

## 1.0.8 — 2026-11-14

- Settings copy (English + Chinese) and the schema description now state the click contract: clicks never reach for the pointer; `type` needs `physical: true`.

## 1.0.7 — 2026-11-14

- `click` became a ladder that never moves the user's mouse: engine semantic click → the control's own advertised action (`select` / `toggle` / `expand` / `collapse`) → a background posted `WM_*` click. The rung used is reported in `data.mechanism`.
- Physical input needs consent: `physical: true` on the call, or the conversation-wide `tools {operation:"headed",on:true}` latch; otherwise `POLICY_DENIED` with `physical_input_requires_consent`.
- Tool surface 22 → 28: `select`, `check`, `uncheck`, `clear`, `scroll_to`, `focus_window`.
- `launch` argv fixed (`--arg` repeatable + `--timeout`); `runCli` gained a 150 s hard ceiling so a wedged engine cannot stall the conversation.
- Verified 21/21 steps against an instrumented WinForms probe: every posted click reported `cursor_moved:false, foreground_changed:false`.

## 1.0.6 — 2026-11-11

- Esc now gates the driver: after the takeover kill, every input tool for that series is refused (`stopped_by_user`); reads stay open, and a new turn self-releases.
- The progress panel defaults to `summary` — the model's raw planning text no longer paints on the desktop.
- `batch` runs the engine's native batch (one spawn, payloads kept) instead of looping per step.
- Overlay-off saves ~155 ms per action: no `get bounds`, no window list, for presentation nobody sees.
- Tool surface 16 → 22: `focus`, `double_click`, `right_click`, `expand`, `collapse`, `toggle`.
- `toolPreset` reset to `lite` in the live control file (a drifted `lazy` costs a wasted round trip when a hidden tool is called).

## 1.0.5 — 2026-11-09

- Headed mode no longer latches a conversation into physical input.

## 1.0.4 — 2026-11-09

- Repeated host flags trimmed out of every web-lane tool schema.

## 1.0.3 — 2026-11-08

- Engine console windows stay off the desktop.

## 1.0.2 — 2026-11-07

- The plugin registers its market index on first run.

## 1.0.1 — 2026-11-07

- Repairs the engine packages when pnpm blocks their build scripts.

## 1.0.0 — 2026-11-07

- First published release: in-process MCP mounting (no absolute paths, no `npx` child), the market index, the takeover UI (window-framed edge glow, ghost cursor, global Esc), the Lite-16 desktop adapter, the web lane, the settings page, chat step rows, and the driver lock.
