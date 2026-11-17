# Changelog

All published versions of [Arya Computer Use](https://github.com/KonnectSuite/dsh-arya-computer-use), newest first.
Release notes for every version also live on the [Releases page](https://github.com/KonnectSuite/dsh-arya-computer-use/releases); dates are the npm publish times.

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
