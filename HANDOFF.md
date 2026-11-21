# Arya Computer Use — Handoff Notes (2026-11-07 ~01:10)

Repo: C:\Users\KNPhu\AryaCode\KonnectSuite\dsh-arya-computer-use (git main, pushed; latest commit 16b940a).
Bundle: @aryacode/dsh-plugin-arya-computer-use 0.1.0, installed via plugin_manager install_bundle (link: source — keep checkout in place). Restart required to apply row changes.

## Goal (evolution)
Replace dsh-computer-use-win (wincu) fully (user decision m00113): agent-desktop UIA engine behind a Lite-16 MCP adapter + agent-browser web lane + wincu-parity takeover UI, published as KonnectSuite package. Headless default → flipped to headedDefault:true per user Phase-0 acceptance. NO subagents ever (user m01014: "No subagents. you are a local LLM and we dont have the resources").

## Hard constraints
- Host MUST run elevated (Administrator) — interaction lease C:\ProgramData\agent-desktop\<SID>\interaction.lock needs protected DACL; non-elevated → INTERNAL 'lock directory is not trustworthy: Access is denied. (os error 5)' kind=lease_directory_untrusted.
- No AGENT_DESKTOP_HOME override to %LOCALAPPDATA% (AppContainer ACEs fail engine private-DACL check 'private file DACL grants an untrusted principal'); use engine default ~/.agent-desktop. Adapter's own dir %LOCALAPPDATA%\dsh-plugin-arya-desktop\screenshots is fine.
- MCP stdio rows must NOT use npx (.cmd shim → Connection closed). Use node + absolute bin path (agent-browser.js) — fixed commit 8fc93ab.
- Windows foreground lock: SetForegroundWindow/AppActivate from background CLI fails; headed mouse-click at window center promotes the window (ensureForeground in adapter). Headed type needs frontmost.
- Snapshots are session-scoped: runCli sets env AGENT_DESKTOP_SESSION after `session start --cursor` (id run-<ts>-<rand>).
- MCP tool results MUST be {content:[{type:'text',text:JSON.stringify(envelope)}]} — raw envelopes render as '(tool returned no model-visible content)' — fixed commit 16b940a (.then out.content check in dispatch).
- screenshot CLI: PATH is POSITIONAL. wait flag --timeout. find --role uses snapshot role names (textfield/button/tabitem/listitem). WinRT OCR via scripts/ocr.ps1 needs FullLanguage powershell.exe + canonical Await MakeGenericMethod pattern.
- wincu row mcp-dsh-computer-use-win stays enabled until Phase 3 retirement (user decisions in b8/b48).

## File status (all node --check verified unless noted)
- mcp/adapter-server.mjs ~485L ✅ — Lite-16 MCP stdio adapter; serial enqueue; polls %LOCALAPPDATA%\dsh-plugin-arya-desktop\control\settings.json 1s (headedDefault/overlayDefault); effectiveHeaded()=override??default; tools {operation:'headed'|'overlay'} toggles per-conversation; ensureForeground promote; ocr; session_end = session end + gc.
- mcp/settings.mjs ~85L ✅ trimmed wincu settings (progressOverlay*+indicator*+shortcuts+tokens + headedDefault/overlayDefault/driverLockEnabled:true).
- mcp/takeover.mjs ✅ renamed: env ARYA_CONFIG_FILE/ARYA_STATE_FILE/ARYA_ACTIVITY_FILE/ARYA_LAYOUT_FILE, eventName Local\DSH-ARYA-<uuid>; spawns powershell scripts/windows-takeover.ps1 (copied wincu .ps1+.cs 86562B unmodified — edge glow/banner/progress/Esc kill).
- mcp/activity.mjs ✅ NEW ~250L: host-side publisher; hooks tools/execute+session/event+assistant-stream; DRIVER LOCK (driverLockEnabled → throw COMPUTER_USE_BUSY for non-driver session); writes activity.json {active,sessionId,turn,indicator,expiresAt:now+5000,progress,lingerUntil}; readableAbort → COMPUTER_USE_STOPPED_IN_DSH.
- index.js ~430L ✅ rewritten: skill provider (rank 350) + Config volatile schema (~standard repair wrapper) + settings.register('arya-computer-use',{applies:'live'}) modern+legacy paths + control dir files + TakeoverControl wiring + installActivity + applySettings→atomicJson(settings.json) (NO connection.update needed — adapter polls) + 250ms overlay-layout poll + entry-options drift sync + webServer GET /plugins/arya/status loopback-only.
- client.js REWRITTEN fresh slim (~430L, arya- prefix, NS 'aryaComputerUse.settings', kind 'arya-series', prefixes mcp__arya_desktop__, Lite-16 actionKeys, sections: indicator/progress/behavior(headedDefault/overlayDefault/driverLockEnabled)/stop; slots settings.section 'computer-use' order 16 + plugins.item/settings.plugin.item id 'arya-computer-use'; configForms.get('arya-computer-use') + settingsScope.bind namespace 'arya-computer-use'; mount() 4-path savePatch). âš ï¸ node --check FAILS at client.js:369 (MouseToolRow return) 'SyntaxError: missing ) after argument list' — caret at `inspect && h('button'`. FIX PENDING: paren balance in MouseToolRow return; intended tree = details>[style,summary(mouseIcon,label,state),activityBody, inspect?button]. Restructure into multi-line, re-check.
- package.json ✅ dsh.client{platform:'web',inject:['@deepseek-ai/dsh-client-locale','@deepseek-ai/dsh-client-ui-settings']} + ./client export + files list updated; takeover.ps1 stub deleted.
- cordis.patch.yml: row1 arya-computer-use plugin, row2 mcp-arya-desktop (node adapter abs path), row3 mcp-arya-browser (node agent-browser.js mcp) — DEV rows, replace with npx after publish.

## Done & verified earlier
Phase 0 eval battery accepted (m00220 'proceed'), spike removed. Phase 1 in-host drive test PASSED both lanes: Notepad type delivered_verified, ocr word rects, save-dialog Don't Save click; example.com open/snapshot/screenshot; batch 3-step; Lite-16 registered. Skill provider works in NEW sessions (this session predates install — 'skill arya-desktop unknown' expected). Overlay rendered:true needs unconfined host parent (sandbox pwsh named-pipe EPERM → rendered:false is boundary, not bug) — verify Phase 2.
Housekeeping: user's Chrome behind stable (213 CVEs) — recommend `agent-browser install`.

## Remaining (Phase 2 close-out)
1. Fix client.js:369 syntax, node --check all clean.
2. git commit + push.
3. plugin_manager remove_bundle @aryacode/dsh-plugin-arya-computer-use then install_bundle (reinstall required to re-read new files/manifest; 'already-installed' blocks plain reinstall).
4. Ask user restart AryaCode (elevated). Verify: settings page renders card; edge glow + banner during drive; Esc kill → STOPPED message, resume flow; chat series rows (arya-series); skill in new session catalog; overlay rendered:true; GET /plugins/arya/status loopback JSON; driver lock BUSY across two conversations.
5. Phase 2 acceptance question to user. Then Phase 3: retire wincu row + publish npm package (KonnectSuite) + README polish.

Context mgmt: compress aggressively (context limit hit 2026-11-07 01:10); blocks b47-b54 hold history; plans in docs/PLAN.md inside repo.
</content>

## 2026-11-07 (late) — background-first default, English takeover UI

- **Default input lane is now headless/background** (`headedDefault: false`). `type`/`press` do not
  move the user's pointer unless the conversation opts in with
  `tools {operation:"headed",on:true}` (Settings -> Computer Use -> "Real mouse and keyboard").
- Headless `type` is denied by the engine on targets that only accept keystrokes
  (`POLICY_DENIED ... focus fallback is denied`); the adapter appends a hint. Use `set_value`
  (ValuePattern, no pointer) or enable headed input for that conversation.
- `set-value` CLI takes the value as a **positional** argument (`set-value <REF> [VALUE]`);
  there is no `--value` flag. Same class of bug as `wait [MS]` and `screenshot <PATH>`.
- **Takeover UI is English**: scripts/windows-takeover.cs has no CJK left
  ("DSH is controlling your computer", "Stop", "DSH · Step N · acting", "DSH · Done · N steps",
  "AI summary · …", tool labels from the Lite-16 set). Default `indicatorText` is English too.
- Settings now persist through the client settings page (verified: toggling "Real mouse and keyboard"
  off wrote `headedDefault: false` into control/settings.json and the profile entry config).
- Esc/resume still need a real hardware keypress to verify: injected keys are ignored on purpose
  (windows-takeover.cs `if (injected) return false;`).
## 2026-11-07 (later) — window-scoped highlight + ghost cursor

Ask (m01996): highlight only the app window being driven, and give the harness its own cursor
instead of decorating the user's pointer.

- **The rim frames one window.** `Frame` now takes the window rect plus a surface rect that grows a
  pill band above (or below, when the window touches the monitor top). The band carries the banner
  and "Esc / Stop"; the glow follows the window rect, not the monitor edges. The per-display edge
  glow survives only as the fallback used while no target window is known.
- **The overlay never reads the real pointer.** `PointerFrame` draws a synthetic arrow plus the
  "DSH" tag at a point the harness supplies, easing toward it; `GetCursorPos` is no longer called by
  the indicator at all, so the user's cursor is neither followed nor highlighted.
- **New `hint` command** (takeover -> overlay): `{target:{left,top,width,height}|null, pointer:{x,y}|null}`.
  `mcp/takeover.mjs` reads `control/target.json` and sends a hint whenever it changes; the overlay
  re-frames on a target change and re-aims the ghost on a pointer change.
- **`control/target.json` is written by the adapter** (`noteTarget`): it caches window rects from
  `launch` / `list_windows` / `snapshot`, resolves an acted control's centre with
  `get <ref> --property bounds`, and falls back to the window centre. `list-windows` returns a bare
  array in `data` (not `{windows: […]}`) — remember that when reading engine output.
- Verified live: rim on the Notepad window only, English banner above it, ghost arrow at the driven
  control's centre, and every action reporting `mechanism: semantic_api` (no pointer input).

## 2026-11-07 (Phase 3 + 4 start) — web lane, lazy preset

- **Phase 3 is complete.** The web lane is configurable instead of hand-edited: `mcp/browser-launcher.mjs` reads `control/settings.json` and spawns `agent-browser mcp` with `--tools`, `--profile`, `--session`, `--state`, `--cdp`, `--headed`. Settings page has a **Web lane** section. Web calls get the same chat step rows as desktop (`browserActionKeys`, prefixes include `mcp__arya_browser__agent_browser_`).
- **wincu retirement was already done** — no `mcp-dsh-computer-use-win` row in the profile patch, no `dsh-computer-use-win` dependency, no bundle entry. Nothing left to uninstall.
- **Lazy preset shipped.** Adapter advertises `capabilities.tools.listChanged: true`; with `toolPreset: 'lazy'` it lists `tools`/`snapshot`/`click` only, and `tools {operation:"load", names:[...]}` reveals the rest and emits `notifications/tools/list_changed`. DSH re-syncs on that notification (`listChanged.onChanged → refreshTools` in `app.asar/dsh/node_modules/@deepseek-ai/dsh-mcp-client/lib/index.js`). Verified: 3 → 5 tools with notification, preset switch notifies, `lite` = 16, unknown names rejected.
- **Publish blocker recorded**: MCP rows use absolute dev paths, so the bundle only installs from a checkout. Options in `docs/PLAN.md` §9 (in-process bridge mount, or an installer that rewrites rows). `npx` is ruled out on Windows.
- GUI lesson: the DSH web UI cannot be navigated with synthetic pointer events (no `<a href>`, `[role=treeitem]` rows ignore dispatched events). Inspect a chat through a desktop screenshot of the AryaCode window (`w-656488`), or reload the renderer so a fresh client bundle applies.

## 2026-11-07 (later still) — Arya name, configurable

- The overlay calls the agent **Arya** by default: ghost-cursor tag `Arya`, banner `Arya is controlling your computer`.
- New setting `pointerLabel` (1–16 characters, default `Arya`) is validated in `mcp/settings.mjs`, declared in the Host schema (`index.js`), carried in the takeover presentation tuple (`mcp/takeover.mjs`), and rendered as `Ghost cursor name` on the settings page (`client.js`). The overlay applies it through the new `ApplyPointerLabel` helper in `scripts/windows-takeover.cs`, redrawing the sprite on change.
- Verified live: tag reads `Arya`; setting it to `Arya Prime` in the UI and saving changed the on-screen tag without a restart; reset back to `Arya`.
- The same name drives the progress panel header (`Arya · Step 13 · acting`, `Arya · Done · N steps`): `ProgressFrame.Agent` in `scripts/windows-takeover.cs` is assigned from `ApplyPointerLabel`, and the settings row is labelled **Agent name** (used for both the tag and the header). Verified live on 2026-11-07 01:51.
- Doc repair: earlier PowerShell rewrites had left mojibake in README/HANDOFF (the UTF-8 bytes of en/em dash, section sign, check mark and arrow were double-encoded); all repaired with a node UTF-8 pass. Never edit these files with Get-Content/Set-Content on PowerShell 5.1.

## 2026-11-08 — releasing is two steps: npm, then the market catalog

- **`npm publish` does not update the Arya Plugin Market.** The market lists whatever the generated catalog says, and the catalog is a file on the `catalog` branch of `KonnectSuite/dsh-arya-market` (`data/arya-plugins.json`). Until the release is recorded there, every user's card keeps the old version and reads "Up to date" — publishing to npm only produces a `catalogue-drift` warning in `~/.aryacode/profiles/<profile>/.dsh-market/log.ndjson` when the update check compares npm against the catalog.
- After publishing, run from the market checkout `C:\Users\KNPhu\AryaCode\KonnectSuite\dsh-arya-market`:

  ```
  node scripts/publish-arya-release.mjs --npm <version> --source KonnectSuite/dsh-arya-computer-use --push
  ```

  It downloads the tarball from the registry, records version + sha256, verifies the branch serves it after the push, and needs `gh` auth with `repo` scope. The repo's `package.json` must keep `dsh.bundle.patch` (`./cordis.patch.yml`), otherwise the script's `inspect()` gate refuses the entry.
- CDNs keep serving the previous catalog for a few minutes after the push (raw.githubusercontent and jsDelivr); the branch is authoritative, clients catch up on their own. The plugin's own index (`MARKET_INDEX_URL`, jsDelivr `@main`) is edge-cached with `s-maxage=43200` (12 h) — purge it after a release with `https://purge.jsdelivr.net/gh/KonnectSuite/dsh-arya-computer-use@main/index.json`.
- 1.0.3 (console-window fix) was recorded this way on 2026-11-08: catalog `version: 1.0.3`, `releases: [1.0.3, 1.0.2]`, sha256 `5d67c77f9f6b2d8a458ac25b88891f09d1197c9dad1eb1e13c11653936a4670d`.

## 2026-11-11 — end-to-end audit + six fixes (released as 1.0.6)

Ask (m00001): verify the plugin end to end, explain why it does not feel faster/more accurate, and check whether too much of the community plugin was carried over. Audit pass first (live drive in-host), then the user said "do all 1-6" (m00247).

### What the audit found
- **The engine is not slow; the number of calls is.** Measured on this devbox from an elevated shell: every CLI call costs ~85 ms regardless of work (snapshot 90 ms, `get bounds` 85 ms, `is focused` 84 ms, `list-windows` 56 ms, `version` alone 16 ms). Per-call spawn (the adapter's model) is only ~7 ms/call slower than a persistent `agent-desktop mcp` process (86 ms vs 79 ms mean) — so the adapter architecture is NOT the reason it feels slow. What costs is the loop: snapshot → action → `get bounds` for the overlay → verify snapshot ≈ 350 ms of engine time per step, before model latency.
- **Esc did not stop the driver.** The takeover lane blocks the series (mcp/takeover.mjs:111,164,184) and the banner says "Esc Stop", but the adapter never consulted `blockedSeries` — it only dropped the headed latch (:129-139) and index.js onStop only logs. So after Esc the agent kept driving. This is the one genuine safety defect found.
- **The progress panel painted the model's raw text on the desktop.** `progressOverlayMode` defaulted to `'source'`; windows-takeover.cs:808 prints the assistant's stream verbatim (my own planning sentences were legible on the user's screen during the audit).
- **`batch` dropped payloads and paid N spawns.** summarizeEnvelope reported only refs/window/pid/delivery, so a batch `find` returned bare "ok" with no ref; and the adapter looped its own steps instead of using the engine's native `batch`.
- **Provenance answer for the user:** no git merges (24 linear commits). By file headers, `scripts/windows-takeover.cs` (1179 L) + `mcp/activity.mjs` (292 L) + `mcp/settings.mjs` vocabulary are wincu-derived (~1.5k lines) vs 686 L of our own adapter. The wanted parts (window-scoped edge highlight, ghost cursor, Settings UI) are ours/kept; the progress panel is the wincu part that buys nothing.
- **Surface gap:** Lite-16 exposed 13 of the engine's 56 operational commands. `click` on an edit refuses headless (POLICY_DENIED, needs focus) and `focus` was not exposed, so the agent burned extra turns.

### The six fixes (all in mcp/adapter-server.mjs unless noted)
1. **Esc gates the driver.** New `ACTIVITY_FILE` (:68), `STOPPED_BY_USER`, `INPUT_TOOLS`, `stoppedSeriesMessage()` (recomputes the takeover series key `JSON.stringify([activity.sessionId, activity.turn])` from the live lease, then reads `blockedSeries` / `stoppedSeriesKey` in state.json), `stoppedResult()`. `callTool` refuses every input tool for a blocked series; reads stay open (the user asked to stop being driven, not to be observed). A new turn is a new key, so it self-releases like the host lane. INSTRUCTIONS gained the matching line.
2. **`progressOverlayMode` default → `'summary'`** (mcp/settings.mjs:6). `'source'` stays available.
3. **Native batch.** `NATIVE_BATCH_COMMANDS` map, `BATCH_ARG_KEYS` whitelist (engine rejects unknown keys; `wait` uses `timeout`), `batchEntryArgs`, `trimBatchData` (drops a batch snapshot's tree, keeps payloads). `batch` runs one `agent-desktop batch <JSON>` with `--stop-on-error` when no step needs physical input; `type/screenshot/ocr/focus/double_click/right_click` fall back to the step loop (the engine's `--headed` is global, so a physical step cannot share a batch with semantic steps). summarizeEnvelope now reports `match.ref_id`, `matches[]`, `snapshot_id`, `value`, `result`.
4. **Overlay-off cost.** noteTarget returns early when `!effectiveOverlay()` (:316) — no `get bounds`, no window list, for presentation nobody sees.
5. **Surface 16 → 22:** `focus, double_click, right_click, expand, collapse, toggle`. Engine fact (mirror skill + crates/windows/src/actions/focus.rs:98): focus/double-click/right-click have NO headless path on Windows (SetFocus takes the foreground; evidence A3-4, A19-5), so those three run `--headed` scoped to that one call, exactly like `type`; expand/collapse/toggle are semantic and stay headless. DECISION to revisit if the user dislikes it: this drives the real pointer without the "Real mouse and keyboard" opt-in; refusing until headed is on is a one-line change.
6. **`toolPreset` back to `lite`** in the live control file (it had drifted to `lazy`, which costs a wasted round trip when a hidden tool is called).

### Measured after the fixes (isolated adapter instance, LOCALAPPDATA override)
- tools/list = 22. Native batch 6 entries: 6/6 completed, engine 451 ms, wall 507 ms (vs ~510 ms step by step) and every entry kept its payload — the `get` entries returned values, the final value read back `2:27 PM 11/11/2026native batch through adapter` (press f5 + set_value both landed in one call).
- Stop gate: `set_value` and `click` refused with `POLICY_DENIED kind=stopped_by_user`, `snapshot` still ok, and after the lease cleared `set_value` ok — `get value` proved the refused write never landed.
- Overlay off: `state.overlay=false`, `target.json` NOT written, set_value mean 247 ms; overlay on: written, mean 402 ms → ~155 ms/action saved.
- `toggle` on a textfield → `ACTION_NOT_SUPPORTED` (correct refusal). `focus` → delivered_verified `UIElement.SetFocus`. `right_click` → delivered_unverified `SendInput.click`.

### Traps hit while testing (record so the next pass does not repeat them)
- The adapter's control dir is `join(process.env.LOCALAPPDATA,'dsh-plugin-arya-desktop')` — an isolated instance needs `LOCALAPPDATA=<tmp>`, and the control files go in `<tmp>\dsh-plugin-arya-desktop\control\`, not `<tmp>\control\`.
- `close-app notepad` does NOT close a window with unsaved changes (a save dialog blocks it) → the next run gets `AMBIGUOUS_TARGET` from two Notepad windows. Force-kill (`Stop-Process -Name notepad -Force`) between runs, or pass `window_id`.
- `noteTarget` needs `state.windowId`; a `launch` alone may not set it in the shape expected, so an overlay-off test that skips a snapshot proves nothing. Snapshot first, then delete target.json, then assert.
- The running adapter in the host is still 1.0.5 code: the fixes land on the next MCP restart / AryaCode restart. index.js keeps `desired` in memory, so a Settings-UI save can rewrite `toolPreset`/`progressOverlayMode` back to the old values until the host restarts.

### Not done
- Real-hardware Esc has still never been pressed to verify the takeover lane's own kill path (injected keys are ignored by design, windows-takeover.cs `if (injected) return false;`). Fix 1 is verified by publishing the same lease state the lane writes, not by a keypress.
- The engine mirror's `focus` headless refusal is upstream policy; if we want headless focus we need an engine change, not an adapter change.

## 2026-11-11 — 1.0.6 published

- Commits `8dccaf2` (the six fixes + docs), `88ba88d` (version bump), `9d582d4` (index.json), all pushed to `main`.
- `package-lock.json` had drifted to **1.0.4** while package.json was 1.0.5 — synced both fields to 1.0.6.
- `npm publish` → `+ @aryacode/dsh-plugin-arya-computer-use@1.0.6`, `latest: 1.0.6`, shasum `60741ef2fc4b335cbbb0dd4e4fe85244f9855108`. npm's staged publishing made the version 404 for ~90 s after the publish succeeded — poll `npm view <name>@<version>` instead of re-publishing (a 409 there means it IS published).
- `node scripts/release-plugin.mjs --dir ../dsh-arya-computer-use` (from `dsh-arya-market`) exited 0: it detected the version already on the registry with matching bytes, reconciled the catalogue, and verified. Catalogue `sha256 6a8a047f562b…`; the `catalog` branch serves `version: 1.0.6`, `releases: [1.0.6, 1.0.5, 1.0.4, 1.0.3, 1.0.2]`. `check-catalogue-parity.mjs`: 0 errors, our row `1.0.6 / 1.0.6 / ok`.
- **Gap found and fixed:** the plugin-hosted `index.json` (the `MARKET_INDEX_URL` jsDelivr serves) had stopped at **1.0.4** — 1.0.5 was never recorded there, so a host reading that index was told 1.0.4 was newest. Added 1.0.5 (`publishTimestamp 1794252476`) and 1.0.6 (`1794426570`) from the npm packument, pushed, and purged `https://purge.jsdelivr.net/gh/KonnectSuite/dsh-arya-computer-use@main/index.json`; jsDelivr then served all five versions. Check this file in every release, not just the market catalog.
- Pre-existing market warning, not ours: `@aryacode/dsh-client-ui-release-notes@0.2.1-rc.3` is on npm but unlistable (its published manifest carries a `workspace:`/`link:`/`file:` dependency).

## 2026-11-14 — 1.0.7: clicks that do not take over the mouse and keyboard

User report (m00001): "mouse clicks dont work unless it takes over the users mouse and
keyboard", against the upstream promise (vercel-labs/agent-desktop) that computer use runs in
parallel with the user's own pointer. Verified end to end on this machine, then fixed.

### Three causes, each measured (not inferred)
1. **The adapter forced physical input.** `focus`, `double_click` and `right_click` ran
   `{headed:true}` on every call (old adapter-server.mjs:543-553) and `type` first ran
   `ensureForeground` — a real `mouse-click --xy` at the element centre (:396-407) — because
   the engine refuses physical delivery unless the target is already foreground:
   `ACTION_FAILED "Target window did not become foreground before headed delivery",
   details.physical_delivery_started:false` (measured on the fixture's double-target).
   Raising the window was therefore the only way to type, and that is the takeover the user felt.
2. **`click` had no background fallback.** The engine's click tries exactly two rungs —
   `InvokePattern.Invoke`, then `LegacyIAccessible.DoDefaultAction`
   (`dsh-arya-agent-desktop/crates/windows/src/actions/dispatch.rs:192-213`,
   `chain.rs:123` "All chain steps exhausted"). Controls that expose neither (WinForms tree
   rows, radios, list rows) therefore fail headless in every mode, and the agent's only
   working path was physical input.
3. **The desktop interaction lease is exclusive and `launch` holds it.** `crates/core/src/
   commands/launch.rs:44` acquires the lease for the whole launch; `crates/windows/src/
   system/launch.rs:39-41` polls for the window until `options.timeout_ms` (default 30000).
   Measured: `launch Probe3.exe` returned after **30064 ms**; a click issued inside that
   window returned `TIMEOUT details.kind:"lock_timeout" path ...\interaction.lock
   purpose:"desktop interaction lease" contention_count:470` in a second adapter process,
   while the live adapter's own click (no launch in flight) reported
   `lease_contention_count:0, lease_hold_ms:267`. A lock_timeout used to end as "the click
   did not work", and the next move was physical.

### The fix (checkout is 1.0.7)
- **`click` is a ladder, and it reports the rung** in `data.mechanism`:
  engine semantic click → the control's own advertised action (`select` with the element's
  own name / `toggle` / `expand` / `collapse`, chosen from the last snapshot's
  `available_actions` + role) → a background `WM_*` posted click
  (`mcp/quiet-input.mjs` → `scripts/quiet-input.ps1`, elevated: `ChildWindowFromPointEx`
  descent from the snapshot's own hwnd, then `WM_MOUSEMOVE`/`WM_LBUTTONDOWN`/`WM_LBUTTONUP`,
  `WM_RBUTTON*`, or `WM_LBUTTONDBLCLK`+up for a double). Nothing on that ladder moves the
  cursor or the foreground; a lock_timeout refusal skips the engine rungs and posts.
- **Physical input needs consent.** `physicalAllowed(args)` = `physical:true` on the call or
  the conversation-wide `tools {operation:"headed",on:true}` latch; otherwise `physicalRefusal`
  returns `POLICY_DENIED` with `details.kind:"physical_input_requires_consent"`. `runCli`
  defaults to `headed:false`, so no call site can silently go physical. `promoteForPhysical`
  (the old ensureForeground) now runs only on that consented path.
- **Surface 22 → 28:** `select, check, uncheck, clear, scroll_to, focus_window` — the semantic
  actions an agent needs instead of clicking, plus the approved way to raise a window.
- **`launch` argv fixed** (`--arg` repeatable + `--timeout`; `--args`/`--timeout-ms` were
  rejected by the engine: `INVALID_ARGS unexpected argument '--args' found`).
- **`runCli` has a 150 s hard ceiling** and kills the engine, so a wedged engine cannot stall
  the queue for the rest of the conversation.

### Verification on this machine (2026-11-14)
- Test target: `tests/fixture-app-windows` plus a purpose-built instrumented WinForms probe
  (`.tmp-desktop-e2e/AryaDesktopProbe.exe`) whose log records cursor/foreground at the moment
  of every UI event — an outside sampler cannot tell the user's own mouse from the agent's.
- **21/21 steps passed** through the patched adapter (`e2e-report.json`): semantic clicks on
  the primary button, a list row, a tab (legacy default action), a tree parent and the menu
  button; posted clicks on a radio, two tree rows, a double-click and a right-click; then
  `set_value`, `clear`, `select`, `check`, `uncheck`, `expand`, `collapse`, `scroll`; and
  `type`/`focus`/`focus_window` refused with the new consent error. Every posted click
  reported `pointer.cursor_moved:false, foreground_changed:false`, and the probe's own event
  lines show the cursor never leaving the user's position.
- **Installed copy verified** (spawned straight from
  `%USERPROFILE%\.aryacode\profiles\desktop\node_modules\@aryacode\dsh-plugin-arya-computer-use`):
  28 tools, `click` → `mechanism:"semantic"`, `type` → `POLICY_DENIED
  kind:physical_input_requires_consent`.
- Repeated UIA foreground noise on WinForms is the toolkit's own behaviour, not the adapter:
  the probe logs `act:Deactivate`/`act:Activated` around a semantic scroll while its cursor
  sample stays put.

- **Contention is retried, not reported first.** `runEngineAction`-style retry
  (`engineAction` in `mcp/adapter-server.mjs`) retries a `lock_timeout` refusal twice with
  backoff (800/1600/3200 ms) before the click ladder answers it, so one `launch` in flight
  no longer turns the next action into `TIMEOUT`. The posted-click notes now say the
  adapter left the pointer alone while the app may take focus itself — read
  `data.pointer.foreground_changed` instead of assuming.

- **The retry is measured, not asserted.** `retrytest.mjs` held the exclusive desktop
  lease for 8 s from a second process, then called `set_value` on the probe's `text-input`
  through the adapter: the call returned `ok:true`, `delivery:"delivered_verified"`,
  `auto_wait.lease_contention_count:176`, took 8036 ms (three refused engine attempts plus
  backoff), and the following `get` read back `retry-ok`. Without `engineAction` that same
  call is `TIMEOUT / details.kind:"lock_timeout"`.

### Deployment state
- **Released 2026-11-14 (1.0.9).** The market `catalog` branch records 1.0.9, the tarball
  npm serves is the committed tree, and the release script verified all four gates
  (`released @aryacode/dsh-plugin-arya-computer-use@1.0.9 · npm ok · catalogue ok ·
  sha256 71b44064fce0`). Parity row `@aryacode/dsh-plugin-arya-computer-use  1.0.9  1.0.9  ok`:
  - 1.0.9 — `engineAction` retries a `lock_timeout` refusal twice with backoff for
    `set_value`, `select`, `check`, `uncheck`, `clear`, `toggle`, `expand`, `collapse`,
    `scroll_to`, `scroll`, `press` and the click alternatives; posted-click notes now say
    the adapter left the pointer alone while the app may take focus itself; sha256
    `71b44064fce0…`.
- **Released 2026-11-14.** The market `catalog` branch records 1.0.8, the tarball npm
  serves is the committed tree, and `node scripts/check-catalogue-parity.mjs` exits 0 with
  "parity: 0 error(s)" and the row `@aryacode/dsh-plugin-arya-computer-use  1.0.8  1.0.8  ok`: The market `catalog` branch records 1.0.8, the tarball npm
  serves is the committed tree, and `node scripts/check-catalogue-parity.mjs` exits 0 with
  "parity: 0 error(s)" and the row `@aryacode/dsh-plugin-arya-computer-use  1.0.8  1.0.8  ok`:
  - 1.0.7 — the click ladder, consent-gated physical input, `launch` argv fix, 150 s engine
    ceiling, lock_timeout retry; sha256 `61dd3181e842ec5499834dd9defe2dc0f300d1a826ff132bc7a53c4347004732`.
  - 1.0.8 — settings copy (en + zh) and the schema description now say what the adapter
    does: clicks never reach for the pointer, `type` needs `physical: true`; sha256
    `58a2a53253c562031277b3c1268476724e2c27acc3f2a51dafd54511632d7dae`.
- The live MCP tools keep the old adapter until AryaCode restarts (the lanes are mounted
  in-process by `index.js`), so a user who is already running AryaCode needs one restart.
  The installed profile was also hot-copied for this verification, byte-identical to the
  published payload.

## Issue #1 — the startup duplicate-registration error was ours (1.0.10)

Reported 2026-11-14 by shuning0128 on DSH Desktop 2.0.23-next with plugin 1.0.6: every
renderer startup logs two lines, `[next-ui-error]` and `Uncaught Error: keyed slot
"tool.call.toolview" already has an entry for key "read" at priority 0 (registered by
read-toolview) — register at a different priority to shadow it (lowest renders)`. Their A/B
(disable → error gone, re-enable → error returns) isolated it to this plugin, but their own
full-text search of our bundle found no `key: "read"`, so they suspected the official
conversation client was being applied twice.

- **Mechanism.** `registerActivity` in `client.js:448` registered each tool name under three
  prefixes, the third being `''`. `browserActionKeys` contains `read` (the web lane's
  `agent_browser_read`), so the empty prefix produced the bare key `read` — the key the
  shipped `read-toolview` owns (`@deepseek-ai/dsh-client-ui-tool`, `key:"read"`, no priority).
  A keyed collision throws only on same key **and** same priority; our client half loads
  through `window.__ModuleLoader__.load`, not the runner's `dyn/<id>`, so it is not behind
  `guardedSlots` priority allocation and our priority stayed `undefined` → 0. Hence
  "at priority 0". The search missed it because the key is computed as `prefix + name`.
- **The part the reporter could not see.** The injection is a generator, so the throw at bare
  `read` aborted the sequence: only 53 of the 135 registrations landed, and only **8 of the 29
  web-lane rows** were ever registered (`open`, `read`, and the six names the two action tables
  share — `snapshot`, `click`, `type`, `press`, `screenshot`, `scroll` — reached through the
  accidental cross-prefix product). The other 21 silently fell back to the generic card. Every
  desktop-lane key landed before the throw, which is why the UI looked unaffected.
- **The registration was a cross-product, and that is a second bug.** `for (const name of names)
  for (const prefix of …)` applied *every* prefix to *every* name, so `mcp__arya_desktop__read`
  and `mcp__arya_browser__agent_browser_find` were registered as keys no wire call can ever have,
  and the names present in both action tables registered the same key twice. Removing only the
  `''` prefix therefore does **not** fix it: the harness shows that variant throwing at
  `mcp__arya_desktop__snapshot` and losing 9 of 29 web-lane rows the same way.
- **Fix (1.0.10).** Keys are built per lane — desktop names take `mcp__arya_desktop__`, browser
  names take `mcp__arya_browser__agent_browser_` — giving 45 unique wire-name keys, no bare key,
  no duplicate, no junk key. The error message's own advice, "register at a different priority",
  is the wrong remedy: it would let our row shadow the shipped `read` card and render the
  built-in file-read tool as an Arya activity row. Present in every release since f1690a2
  (2026-11-07, Phase 3 web lane), so 1.0.6 through 1.0.9 all carry it.
- **Verified locally** (no build/test suite): `node --check client.js` clean, plus
  `.tmp-verify/toolview-keys.mjs` — a harness that replays the client half against the keyed-slot
  rule read verbatim from the shipped bundle, with the 24 first-party keys pre-registered. It runs
  three variants and passes: published code throws at `key "read"` (the reported error, verbatim);
  the prefix-only variant still throws, at `mcp__arya_desktop__snapshot`; lane-matched code
  registers 16 + 29 keys with zero errors. Worth keeping as a guard if a test suite is ever added.
- **Verified on Dev AryaCode (2026-11-16), A/B in one profile.** 1.0.10 was installed as a
  `file:` tarball in `%LOCALAPPDATA%\AryaCode-dev\home\profiles\desktop` (pnpm remove + pnpm add,
  never a hot copy), and the same instance was relaunched three times on that profile.
  - With the published **1.0.9** the renderer logs the reporter's line verbatim: `Uncaught Error:
    keyed slot "tool.call.toolview" already has an entry for key "read" at priority 0 (registered
    by read-toolview) — register at a different priority to shadow it (lowest renders)`
    (`%LOCALAPPDATA%\AryaCode-dev\dev-issue1c.err.log`). That is the reproduction the reporter
    asked for, produced in the real host rather than in a harness.
  - With **1.0.10** the same launch logs **zero** `keyed slot` lines and zero `did not activate` /
    `import failed` / `duplicate factory` / `failed to load` (`dev-issue1d.out.log`,
    `dev-issue1d.err.log`); the renderer's client load list contains
    `@aryacode/dsh-plugin-arya-computer-use/client.js`; `GET /plugins/arya/status` answers
    `version "1.0.10"` with `mcp.mounted:true`, `servers ["arya_desktop","arya_browser"]`,
    `resolveErrors:[]`; `GET /dsh-market/installed` reports `activation.state "live"` with no
    diagnostics findings and `brokenPlugins {}`. The Plugins panel shows **Arya Computer Use
    v1.0.10**, its enable switch on, Components 1 total · 1 running
    (`.tmp-verify/dev-1010-plugin-detail.png`, `.tmp-verify/dev-1010-final.png`).
  - **What that does and does not prove.** The only way that injection generator aborts is a
    collision throw, and the 1.0.9 run shows the throw surfacing as exactly one renderer line, so
    zero lines on 1.0.10 means all 45 keys registered. A web-lane row (`agent_browser_snapshot`,
    …) rendering in Arya style was **not** eyeballed in a live dev-host chat; that inference is
    the remaining soft spot in this pass.
- **Launch note for the next verification pass:** from an agent shell the dev desktop must be
  started with `ELECTRON_DISABLE_SANDBOX=1`. Measured: a bare Electron 44.7.0 probe fails with
  `Renderer process launch-failed` and `GPU process launch failed: error_code=18` plus
  `persistent_cache_sandboxed_file_factory.cc:153 … GPUPersistentCache\DawnGraphiteCache\…`
  **in any userData directory, including a fresh temp one**, and starts clean with that switch —
  so it is the confined shell blocking Chromium's sandboxed children, not a locked or badly
  ACL'd directory. Verification-environment switch only; it touches nothing in the plugin.
- **Published 2026-11-16: 1.0.10** from commit `a5d18f8`. `node ../dsh-arya-market/scripts/release-plugin.mjs --dir ../dsh-arya-computer-use` exits 0 — npm ok (tag `latest`), the `catalog` branch records 1.0.10, `check-catalogue-parity.mjs` exit 0. Published tarball **sha256 `e644c53b3bbb10d4dac8f4c8fb4e34af550b067123b424596dcc44464a23b5a6`** (22 files, 111.6 kB packed / 368.2 kB unpacked, npm shasum `a590fd91d69c909fb9cb2aa96271261335b8c20f`). Live catalogue: https://raw.githubusercontent.com/KonnectSuite/dsh-arya-market/catalog/data/arya-plugins.json
  - First run published but timed out its 180 s registry wait during npm propagation and exited 1 before the catalogue gates; the re-run reported "already on the registry with these exact bytes — nothing to publish" and finished. That is the script's intended resume, not a double publish.
- **Lesson for any future client half:** never register `tool.call.toolview` under a bare
  name. `dsh-client-ui-tool` keys that slot by wire Tool name and first-party owns the bare
  ones (`read`, `edit`, `write`, `apply_patch`, `grep`, `present`, `skill`, `schedule_*`,
  `*_goal`, …). A third-party plugin's keys must carry its own `mcp__…` prefix.
## Publishing front: the stale listing, tags, releases, README (2026-11-17)

Issue #1's fix shipped as 1.0.10, and the reporter's screenshots showed the market card
stuck at 1.0.8 while the installed page read 1.0.10. Measured cause, three listings, three
cadences: the authoritative catalog branch and npm were correct at 1.0.10; the community
crawler entry lagged at 1.0.9; the plugin's own index.json - the listing the README tells
users to add and index.js self-registers - had stopped at 1.0.6, hand-kept, timestamps
drifting (1.0.5 recorded a full day early). Nothing in the release process touched it.

What changed:
- CHANGELOG.md: one entry per published version, 1.0.10 to 1.0.0 (gate-1), npm publish
  times as dates.
- scripts/sync-market-index.mjs: rebuilds index.json from npm's publish times; the release
  command runs it, commits it, and cuts the v<version> tag AFTER that commit - a tag-pinned
  jsDelivr URL serves the tag's tree forever, so the tag must carry the fresh listing.
- release-plugin.mjs (dsh-arya-market 71a3115): tag + push + gh release create with the
  CHANGELOG entry as notes, non-fatal (a missing gh never undoes a published npm version);
  --no-github skips. AGENTS-PLUGINS.md gates 1 and 4 updated to match.
- Tags v1.0.2..v1.0.10 and nine GitHub releases created (notes-only; the catalog keeps
  pointing at npm tarballs - validateAryaRegistry accepts both, every entry uses npm).
- index.js MARKET_INDEX_URL: @main -> @latest. @main is a branch URL behind a 12-hour edge
  cache that serves the old listing after every push; @latest resolves to the newest tag.
  Installed 1.0.10 keeps @main in its own index.js; 1.0.11+ ships @latest.
- Tag v1.0.10 moved to the final HEAD of this work so @latest/index.json serves 11 versions.
- README rewritten (Vercel positioning per user request m00786, gate-1 section order,
  badges, preview screenshot, all phases shipped, 28-tool counts fixed) + README.zh.md
  mirror + docs/preview.png (the market card previews README images - the card had none).
  locale/en.json and the GitHub About carry the same framing; wincu history stays in
  docs/PLAN.md, HANDOFF.md and the MIT attribution headers (NOTICE.md, source headers).
- AGENTS.md: version no longer pinned in prose (it drifted at 1.0.4), layout table current,
  rule 9 (tool.call.toolview keys are lane-prefixed wire names - issue #1's mechanism, keep
  .tmp-verify/toolview-keys.mjs passing), rule 10 (public surfaces state what it is, not
  what it replaced), releasing section matches the new command + Dev AryaCode launch facts.

## 1.0.11 — the browser executable path (issue #1 follow-up)

The reporter's re-verification of 1.0.10 passed both halves (startup lines gone;
the web-lane row renders in plugin style — his probe was agent_browser_get_title,
one of the 21 names that had never registered). Issue #1 closed with his result.

His new observation is real and unrelated to the key fix: agent-browser's
auto-launch checks its own download cache and system Chrome only. A machine with
Edge and no Chrome gets `Auto-launch failed: Chrome not found`. The engine has
no Edge detection (grep msedge: 0 hits in agent-browser 0.41.2).

Fix: a **Browser executable path** setting (`browserExecutablePath`, absolute
path, default empty) threaded host schema (index.js) -> settings store
(mcp/settings.mjs) -> web-lane launcher (mcp/browser-launcher.mjs) -> settings
page row with en+zh copy. Empty keeps the old behaviour.

Measured mechanism (agent-browser 0.41.2, 2026-11-17, tests gate2c-*.mjs in
KonnectSuite/.tmp-verify): the engine reads the browser in two different ways
depending on mode. In CLI mode (`agent-browser open …`) the
`--executable-path` flag works in either argument position (msedge 5 -> 19,
12 -> 26). In `mcp` server mode the daemon IGNORES the flag in both positions
(both opened its own Chrome) and honors the `AGENT_BROWSER_EXECUTABLE_PATH`
env var instead (msedge 5 -> 21, clean open, fresh profile dir). So
browser-launcher main() sets that env var on the daemon spawn; the flag stays
in browserArgs for CLI-mode runs, but **a daemon command line carrying the
flag is not proof the path took effect** — proof is behavioral (msedge count
rises, open text has no "warning: Chrome").

Trap found the hard way: a test launcher joined the OLD dev daemon (same
package path, default namespace, spawned before the fix) and the env var never
reached the daemon handling the open; the open failed with `Chrome exited
early (exit code: 0) without writing DevToolsActivePort` — the handoff
signature. Daemons in the default namespace coexist when their package paths
differ (production 2108 vs dev 18960), so a join is keyed by path, not just
namespace. Re-test against a daemon spawned WITH the env, not one that was
already up.

Headed gap (measured, NOT shipped): `--headed` is also ignored in mcp mode
(both positions); `AGENT_BROWSER_HEADED=1` IS honored (launch behavior
changes) but the headed launch fails on this machine for both Edge and
agent-browser's own Chrome (`exited early (exit code: 0)`, hint
`--args "--no-sandbox"`), likely single-instance handoff with 29 chrome + 5
msedge processes already running. Shipping AGENT_BROWSER_HEADED for the
browserHeaded setting would turn today's silent-headless into a hard error,
so it stays a follow-up; callers can still pass headed per call to
agent_browser_open. browserCdp/browserSession/browserProfile/browserStateFile
flags after `mcp`: respect unknown, left flag-only (settings are empty).

Gate-2 pass (2026-11-17, dev AryaCode, launch 8b): the settings page row saved the Edge
path and it persisted (status route shows it after a restart); the MCP mount spawned the
dev daemon through the fixed launcher; the end-to-end test (gate2c-e2e-installed.mjs,
speaking MCP to the INSTALLED launcher) opened https://example.com with msedge 5 -> 19
during the open, a fresh agent-browser profile dir, and
`HeadlessChrome/157.0.0.0 Safari/537.36 Edg/157.0.0.0` in navigator.userAgent — the page
rendered in Edge, not Chrome. Startup logs: zero keyed-slot or activation errors.
- **Published 2026-11-17: 1.0.11** (user-approved gate 3). npm `latest` + catalog recorded +
  tag v1.0.11 -> 7b719c6 + GitHub release with the CHANGELOG entry as notes; sha256
  1cc6e0789e9c…, 23 files, 120.6 kB packed / 390.6 kB unpacked, npm shasum f9893c36….
  The release script pushed the index-sync commit and the tag itself this time.
  npmmirror: 1.0.10 auto-synced (mirror time 2026-11-17T03:27:56Z); a manual sync for 1.0.11
  was queued via `PUT https://registry.npmmirror.com/-/package/<pkg>/syncs` (201, state waiting)
  — that endpoint form is the working one; the bare `/<pkg>/syncs` returns 422.
  Issue #1 closed with the bilingual thank-you + 1.0.11 notice + mirror guidance
  (comment 6964632290).

## Issue #2 — the browser lane never found its native (2026-11-19, candidate 1.0.12)

shuning0128 reported (issue #2) that every AryaCode start popped a black
`agent-browser-win32-x64.exe` console window on the Windows desktop, hidden a few
seconds later by this plugin's own `scripts/hide-consoles.ps1`. His diagnosis:
`nativeBin()` looked for the native at the **package root** while agent-browser
ships it beside `bin/agent-browser.js`, so the lookup always failed and the lane
fell back to the npm shim — whose `spawn(binaryPath, argv, { stdio:'inherit',
windowsHide:false })` (agent-browser 0.41.2 `bin/agent-browser.js:115-118`) is
what allocates the visible console.

He is right, and the watchdog is why it survived: `git blame`
`mcp/browser-launcher.mjs:27-41` is all `91e0e31` ("1.0.3: keep the engine console
windows off the desktop"), and `git tag --contains 91e0e31` covers **v1.0.3 through
v1.0.11**. The rule in the header was written correctly — skip the shim, spawn the
native — and resolved wrongly on every single run. `hide-consoles.ps1` hid the
symptom, so nothing looked broken. Lesson recorded in `docs/PLAN.md`: a watchdog
that hides a symptom is not evidence the symptom is gone.

Fix (1.0.12): `nativeBin()` anchors on `dirname(SHIM)` instead of the package root,
so it resolves beside the shim whatever layout the engine ships; `linux-musl` is
chosen the way the shim decides it, `x86_64`/`aarch64` aliases are accepted, the
win32-arm64 → x64 fallback checks the directory it will actually spawn from (that
native is not shipped in 0.41.2), the shim's exec-bit repair (`chmod 0o755`) is
carried over, and a fallback to the shim now prints one stderr line instead of
failing silently. `nativeBin()` is exported for testing. The desktop lane already
had this right (`mcp/adapter-server.mjs:41` `join(pkgDir, 'bin', entry.binaryName)`),
which is why only the browser window ever appeared.

Measured A/B on this machine (harnesses in `KonnectSuite/.tmp-verify`, kept out of
the repo so the release script sees a clean tree):
- `issue2-nativebin.mjs` — imports the real exported `nativeBin()`, recomputes the
  shim's own expected name, and carries a regression guard that the package-root
  anchor does NOT hold the file. PASS: `…\agent-browser\bin\agent-browser-win32-x64.exe`.
- `issue2-launch-chain.mjs` — spawns the launcher, speaks MCP, opens a page, walks the
  process tree. 1.0.11 production chain (pid 7256 launcher → **28548 `agent-browser.js`
  shim** → 12988 native) vs 1.0.12 (launcher → `agent-browser-win32-x64.exe` directly,
  no shim rung, subtree is daemon + `conhost.exe` only, zero console windows).
- `issue2-console-windows.ps1` enumerates every `ConsoleWindowClass` window with
  pid/exe/visible. The 1.0.11 daemon's window is there with `visible=False` (the
  watchdog hid it); the fixed daemon owns none; no engine window visible on the desktop.
  Note the mechanism: the shim's `stdio:'inherit'` + `windowsHide:false` spawn still
  gets a console allocated because its parent has none; our `windowsHide:true` is
  `CREATE_NO_WINDOW`, so conhost exists with no window.
  Harness trap worth remembering: `powershell -Command "& '<path>'"` is refused
  ("not digitally signed") and returns empty stdout, which reads as a false "0
  windows". Use `powershell -NoProfile -ExecutionPolicy Bypass -File <path>`, and
  assert a positive control before trusting any zero.

Gate-2 pass (2026-11-19, dev AryaCode, candidate tarball installed with `pnpm remove`
+ `pnpm add file:` into `%LOCALAPPDATA%\AryaCode-dev\home\profiles\desktop`, launched
through `AryaCode-dev.bat desktop` with `ARYACODE_REPO` pointed at the KonnectSuite
checkout and `ELECTRON_DISABLE_SANDBOX=1`): `/plugins/arya/status` answers version
**1.0.12** with `mcp.mounted:true`, both servers, `resolveErrors:[]`; `/dsh-market/installed`
reports `activation.state "live"` and empty `diagnostics.findings`; the dev daemon is
spawned as `agent-browser-win32-x64.exe mcp --tools core --executable-path "…msedge.exe"`
with no shim rung and no console window; `gate2c-e2e-installed.mjs` opened
https://example.com through the INSTALLED launcher (msedge 5 → 19 → 5, fresh profile
dir, `HeadlessChrome/157.0.0.0 … Edg/157.0.0.0`); the desktop lane drove a ref end to
end (`set_value` then `get` readback `issue2 gate2 ref drive 1.0.12`); startup stderr
carries no activation/import/factory/keyed-slot error; a cold start reproduces the fix.
Notepad on Win11 is single-instance, so `launch notepad.exe` attaches to the user's
window — the harness opened its own scratch file and targeted only that window, then
closed both tabs it created through the window's own Close Tab affordance.

- **Published 2026-11-19: 1.0.12** (user-approved gate 3). npm `latest` + catalog recorded +
  tag v1.0.12 -> 5d05911 (`index.json: 1.0.12`) + GitHub release v1.0.12 with the CHANGELOG
  entry as notes; sha256 0ebad5e646ee…, 23 files, 121.9 kB packed / 393.6 kB unpacked, npm
  shasum 28d5b4d3…. `check-catalogue-parity.mjs` exits 0: catalog 1.0.12, npm 1.0.12,
  sha256 ok, 0 errors / 0 warnings. `origin/main` == `v1.0.12` == 5d05911, so the tag-pinned
  jsDelivr listing URL serves the tree that carries the new `index.json`.
  Recovery worth remembering: the **first** release run published the package and then exited
  1 — npm accepted it ("may take a few minutes to become available") while the script's 180 s
  poll of the tarball URL was still seeing 404, so the index sync, tag, push, GitHub release
  and catalogue steps never ran. The correct recovery is to re-run the same command: its
  already-published guard (`release-plugin.mjs:297-312`) reported "already on the registry
  with these exact bytes — nothing to publish" and completed the rest. Never hand-edit
  `index.json`, never hand-cut the tag, never re-publish a version.
  npmmirror: manual sync queued for 1.0.12 with the working form
  `PUT https://registry.npmmirror.com/-/package/@aryacode%2Fdsh-plugin-arya-computer-use/syncs`
  (201, id 6aff7fface56bbdeae4c239b, state waiting).
  Issue #2: bilingual thank-you + confirmation of his diagnosis + the 1.0.3-1.0.11 blast
  radius + the measured A/B posted (comment 7024658122). The issue is left **OPEN** by the
  maintainer's instruction — close only with explicit approval or after 5 days (2026-11-24).

## Executed — 1.0.13 engine update + settings UI (2026-11-20/21) — WITHDRAWN before release

**Withdrawal (2026-11-21).** The maintainer rejected the settings UI — user said (m01474):
"dont release 1.0.13 yet. i dont approve the Settings UI. what you added as an 'Overhaul' was
trash. you match the strategy or theme. manual typing on things that can use file exployer,
etc. this is a entry level design." Part A (the engine update) and the functional Part B fixes
stand verbatim; the page itself is rebuilt on the host's own kit as **1.0.14** (next section).
The tarball had already reached npm mid-script, so: `latest` moved back to 1.0.12, 1.0.13 is
deprecated ("withdrawn by the maintainer before release — settings UI rejected; install
1.0.12"), and `npm unpublish` is refused for granular tokens (E403, two-factor bypass) — the
full withdrawal needs the account owner. 1.0.13 is burned; never re-use that version.

The plan below the old heading was drafted, reviewed and HELD; the maintainer then chose to
**un-hold it now** — issue #2 stays open until 2026-11-24 (comment 7024658122) on purpose:
1.0.13 removes the mechanism from our lane regardless of what that issue concludes. Executed
end to end: Part A (A1–A8), Part B (B1–B11), Part C, verification V1–V9. V10 is the release
gate sequence and runs after this commit. The plan text itself lives in git (`c622286`) and in
`KonnectSuite/.tmp-verify/PLAN-1.0.13-approved.md`; every harness used below lives in
`KonnectSuite/.tmp-verify/` (never in the repo).

### Part A — engine update (A1–A8)

- `package.json`: version 1.0.13, `engines.node` `">=22"`, `agent-browser@0.43.0`,
  `agent-desktop@1.3.1` (the rustix security bump — RUSTSEC-2026-0486, agent-desktop#670).
  `package-lock.json` regenerated; it was stale at 1.0.6 and now carries all seven
  `@agent-browser/cli-*` optional packages. Decision: npm stays the tracked lock — no
  `pnpm-lock.yaml` was introduced.
- `mcp/browser-launcher.mjs` rewritten (~359 L): lazy `shimPath()`/`packageRoot()` (importing
  the module without agent-browser installed must not throw — `index.js` imports it);
  `hostLibc()` subprocess-free; `legacyNativeBin()` keeps the 1.0.12 beside-the-shim rule as a
  scan branch; `anchoredPlatformBin()` is the engine-anchored `createRequire` fallback;
  `nativeBin()` returns `{bin, mode}` with mode `package-bin` | `platform-package` — never a
  silent shim. Measured: the repo checkout resolves into
  `node_modules\.pnpm\@agent-browser+cli-win32-x64-msvc@0.43.0\…\bin\agent-browser.exe`
  (`platform-package`); the dev profile install hoists the platform package to the profile
  root — the same anchored resolve handles both layouts.
- `browserArgs()` appends `--tools <profile>`, `--idle-timeout`, `--namespace`, `--ca-cert`,
  `--use-system-ca`, one `--confirm-actions` per entry, then `--headed` only under physical
  consent; `browserEnv()` sets `AGENT_BROWSER_EXECUTABLE_PATH`, `AGENT_BROWSER_DEFAULT_TIMEOUT`,
  `AGENT_BROWSER_ALLOWED_DOMAINS`. **Decisive measurement: the `--allowed-domains` FLAG IS A
  NO-OP on 0.43.0** (that daemon opened wikipedia); the **env var enforces** — `Domain
  'www.wikipedia.org' is not in the allowed domains list`. Domains ship through the env only.
- Facts publishers (B9): `publishFacts()` → `…\dsh-plugin-arya-desktop\control\info-browser.json`
  (lane, native, nativeMode, toolsProfile, stripMode, strippedKeys, flags, env names,
  executablePath, at); `publishDesktopFacts()` in `mcp/adapter-server.mjs` → `info-desktop.json`
  (called at startup and on change from the 1000 ms settings poll).
- `index.js`: `engineBinaryFor()` + async `ensureEngine()` — a healthy 0.43.0 install now
  reports `binary:'platform-package'` where 1.0.12 called it "missing".
  `scripts/hide-consoles.ps1` PathPattern widened to
  `'\\node_modules\\(@agent-browser\\[^\\]+|agent-(browser|desktop))\\bin\\'` — the watcher is a
  watchdog only: our launcher spawns the native with piped stdio + `windowsHide:true`, so there
  is no console window to hide.
- A8: `flow_list/flow_run/flow_save/flow_steps` are core in 0.43.0 and pass the strip
  untouched; the `browserConfirmActions` setting exposes `--confirm-actions` only — never
  `--allow-write`; `skills/arya-desktop/SKILL.md` gained the flows bullet.
- Host ceiling: `index.js` `mountMcpServers` `toolCallTimeoutMs` 120000 → **315000** — the host
  ceiling must sit above every lane's own timeout (`engineCallTimeoutMs` max 300000) or the host
  kills the call before the adapter's explanatory envelope reaches the model.
- New settings (`mcp/settings.mjs` `DEFAULT_SETTINGS` + `normalizeSettings` validators, every
  value range-checked, never trusted): `browserAllowedDomains`, `browserIdleTimeout` (duration
  regex), `browserNamespace`, `browserCaCert`, `browserUseSystemCa`, `browserDefaultTimeoutMs`
  (0 or 1000–600000), `browserConfirmActions`, `engineCallTimeoutMs` (10000–300000, default
  150000), `leaseRetryBaseMs` (0 or 100–10000, default 800 → `leaseRetryLadder()` replaces the
  const 800/1600/3200), `screenshotDir` (absolute, or empty = the plugin folder).
- **Real bug found by V4 and fixed: a UTF-8 BOM control file silently reset every setting.**
  PowerShell/Notepad write a BOM; `JSON.parse` threw; every control-file reader then returned
  defaults, so user edits did nothing. `readJsonFile()` in `mcp/settings.mjs` strips `0xFEFF`
  and is now the ONLY control-file reader (`mcp/browser-launcher.mjs`,
  `mcp/adapter-server.mjs` ×4, `mcp/takeover.mjs`, `index.js`).

### Part B — settings UI (B1–B11)

- `client.js` rewritten (~640 L): five labelled lanes (Desktop / Indicator / Progress /
  Takeover & stop / Web — "Which tools", "Which browser", "Network and trust") plus a Status
  `<details>`; `arts.browser()`; the preset row reads "lite · all 28"; the progress-mode segment
  (source|summary) — the schema bug `z.const('source')` had made `summary` unreachable, fixed to
  a union defaulting to `summary`; a Resume button in the Stop section head
  (`run({resumeToken:Date.now()},'resumed')`); per-field validation that names the field, marks
  `[data-arya-invalid]` and focuses it; honest measured copy; zh + en strings for everything new.
- B10 deviation from the plan (61 → **62 keys**): 28 desktop + 34 web — 0.43.0 core adds
  `flow_list/flow_run/flow_save/flow_steps` and `tools_profiles`; `dblclick` is kept (it is a
  real engine tool under a non-core profile). The defect this closes: 17 tools (12 desktop +
  5 web) had no chat step row. The rule-9 replay
  (`KonnectSuite/.tmp-verify/toolview-keys.mjs`) is the evidence: 62 unique keys, no bare key,
  no first-party collision, coverage complete in both lanes, verdict **PASS**.
- B9 Status panel: `GET /plugins/arya/status` (same-origin, no token) answers version, settings,
  `mcp {mounted, servers, resolveErrors, engines[]}`, `lanes{browser,desktop}` read from the two
  facts files, `engines{versions, elevated, lease{root, present}}` — the lease is a read-only
  `existsSync` probe of `C:\ProgramData\agent-desktop`, never a touch of `interaction.lock`
  (rule 1) — and the takeover state.
- V8 found and fixed a real defect: `mountMcpServers` **replaced** `mcpStatus` wholesale,
  dropping the per-engine readiness `apply()` had merged, so the Status panel's "Engine
  self-check" rows could never render — both assignments now spread (`{...mcpStatus, …}`).
  Plus lane heads (Browser lane / Desktop lane / This session).

### Verification (V1–V9 measured; V10 = the release gates)

- V2 surfaces: web core = **33 tools / 24,594 B schema / 60 unique arg keys**; the strip removes
  52 key occurrences → **17,793 B** (≈1.7k tokens); **all = 160 tools** (the old "all 64" was an
  unpaginated first page). Profiles: core 33, network 9, state 27, debug 40, tabs 13, react 8,
  mobile 15, webmcp 4. `ad-flag-check`: every flag the adapter passes still exists in
  agent-desktop 1.3.1 (29 commands, 0 missing); `--cursor` belongs to `session start`, not
  `snapshot` (unchanged in 1.3.1).
- V4/V6 through our own launcher: `info-browser.json` published the new flags/env, and domain
  enforcement reached the daemon (refusal quoted above). Cleanup: namespace closed, control file
  restored byte-for-byte.
- V5: the OLD PathPattern does NOT match the resolved 0.43.0 native path, the NEW one does; the
  live 1.0.13 chain left `hide-consoles.ps1 -Once -Report` with ZERO candidates. Limitation
  recorded: the watcher's TITLE branch could not be exercised on this machine — Windows 11's
  default terminal is Windows Terminal, and no classic `ConsoleWindowClass` window can be
  produced from an agent shell here.
- V7a settings round-trip: **42/42** (the 10 new defaults present; valid forms preserved;
  invalid forms rejected with a message that names the field). Note `normalizeSettings` splits
  domains and confirm-actions on `/[,\s]+/` by design.
- **V7b + V8 + V9 on Dev AryaCode — the gate-2 manual pass.** Profile
  `%LOCALAPPDATA%\AryaCode-dev\home\profiles\desktop`; `pnpm remove` + `pnpm add
  file:.tmp-verify\aryacode-dsh-plugin-arya-computer-use-1.0.13.tgz` — **sha256
  c4980693509406a3aca88bf2d7dce8f1864be9724ec85c9efb2021430fbbdc56**, 23 files (the first pack
  `419bec66…` is superseded). `[ERR_PNPM_IGNORED_BUILDS]` for both engines is harmless:
  agent-desktop 1.3.1 ships its natives in `bin/` (with `.sha256` sidecars) and agent-browser's
  native is a plain optional package. Launch: `AryaCode-dev.bat desktop` with `ARYACODE_REPO`,
  `ELECTRON_DISABLE_SANDBOX=1`, `DSH_DESKTOP_RENDERER_DEBUG_PORT=9333`, stdin from NUL — the
  `< NUL` redirect must run inside `cmd /c` (it is a PowerShell parse error); run-gates 8 passed
  0 failed; the web port changes every launch (57890 this pass).
- Status route + panel on that host: `mcp.engines` = agent-desktop ok `package-bin`,
  agent-browser ok `platform-package` + path; the panel renders the lane heads, both engine
  self-check rows, "28 / 28 · lite", "150000 ms", "Lease root present"
  (screenshot `.tmp-verify\v8-status-final.png`). The B7 live round-trip: typing `30 minutes` →
  named error + the exact input marked and focused; `15m` → Saved + the control file reads 15m;
  restoring `""` → Saved and verified by direct read.
- V9 desktop drive (raw MCP stdio against the INSTALLED adapter): **13/13** — launch → poll
  `list_windows` (w-11469720 "Untitled - Notepad" pid 28824) → snapshot 21 refs → find Text
  Editor → `set_value` → re-read the exact string → `is focused` → `clear` → re-read empty →
  Close click (semantic, `lease_hold_ms 163`, contention 0) → window gone. Engine finding:
  `launch` returns `{app, pid, process_instance}` with NO window field in BOTH 1.2.0 and 1.3.1 —
  the adapter's `data.window` branch is inert in both, not a 1.3.1 regression. Win11 packaged
  Notepad hands the System32 stub off to the packaged process, so `launch` waits its full
  timeout on the stub pid and windows can be reaped: drive in ONE session and poll
  `list_windows` by title.
- V9 browser lane (INSTALLED launcher): open example.com → eval UA
  `…HeadlessChrome/157.0.0.0 … Edg/157.0.0.0` (the executable-path env reached the engine) →
  snapshot link "Learn more" → close. Note: example.com now has NO `h1` (a multi-language
  paragraph page) — a harness step was wrong, the engine was right.
- Stop-gate, the plan's Esc test, run WITH the user. Finding first: the overlay hook IGNORES
  injected input (`scripts/windows-takeover.cs:477-478` `if (injected) return false;`) — the
  stop is reserved for the human's physical keyboard, so an "Esc via SendInput" test cannot pass
  by design. The user pressed physical Esc during a held series: `state.json` → `paused:true` +
  `stoppedSeriesKey` + `blockedSeries`; the next input call was refused `POLICY_DENIED`
  `kind:"stopped_by_user"` (repeatable), while READ calls kept passing. Resume: bumping
  `resumeToken` — exactly what the Resume button's `savePatch` does — un-paused within 500 ms
  (`reason:"resumed-by-user"`); after that the same press call passes the gate and fails only at
  the engine's own focus confirmation (`STALE_REF exact_window_focus_unconfirmed`) — that is the
  un-block evidence. Nuance recorded honestly: the Resume BUTTON click itself is verified only
  through that host contract — the physical Esc also closed the dev settings modal (the app's own
  Esc-closes-top-modal handler), and re-opening it over CDP failed because the app's keybinding
  resolver is focus-gated (`Input.dispatchKeyEvent` opens the shell only while the renderer holds
  OS focus).
- Artifacts to know about (pre-existing, NOT 1.0.13 defects): the control dir
  `%LOCALAPPDATA%\dsh-plugin-arya-desktop\control` is SHARED by every host on the machine, so the
  dev host mirrors the production host's takeover/activity state (V7b's stale `blockedSeries`
  keys, V8's "Takeover driving now"); and a RUNNING launcher never re-reads its args — only a
  fresh spawn picks up new flags.

### Out of scope (open threads 1.0.13 does not close)

- The deferred **issue #2** close — explicit approval or on/after 2026-11-24. 1.0.13 removes the
  mechanism from our lane either way: the native is resolved through `nativeBin()`.
- The production AryaCode profile stays on the previous version until the catalogue reaches it.
- The headed-mode gap (`client.js:413-422` note) and live engine diagnostics beyond B8's spike.
- The shared-control-dir mirror (two hosts, one machine) — a design question for a later release.

## Executed — 1.0.14: the settings page rebuilt on the host kit (2026-11-21)

Part A and the functional fixes carry over from the 1.0.13 record unchanged; this section is
the settings UI rebuilt to the maintainer's rejection above. The design contract lives in
`KonnectSuite/.tmp-verify/DESIGN-1.0.14-settings.md` (approved before building); every harness
stays out of the repo.

### Why the 1.0.13 page looked foreign, and the seam that fixes it

- The host rule is explicit (`AryaCode/docs/web-styling.md:16`): "the ui-primitives component
  catalog is the only channel". House rows = title+description left, control right; plugin
  settings cards (ShellCard/WebSearchCard/…) all render through the kit's settings-form layer.
- `require('@deepseek-ai/dsh-client-ui-primitives')` works for our build-less bundle: the
  loader's seed table (`packages/client/web/src/seed.ts`, keys from `PLATFORM_MODULES`) is
  checked FIRST for every fetched bundle (`system.ts makeRequire`). No vendoring needed.
- Our settings were already a host config namespace (`index.js` `settings.register
  ('arya-computer-use', SettingsConfig, …)`); the `configForms.get('arya-computer-use')`
  ConfigForm `{getSnapshot, subscribe, mutate(ops, expectedRevision)}` satisfies
  `SettingsFormScope` as-is. Staged drafts, per-field validation gating Save, Overridden tag +
  Reset (presence in the user layer), revision-fenced writes and the saveFailed footer all come
  from `SettingsFormModel` for free — one spec per field mirroring the `mcp/settings.mjs`
  validators, so client and host can never disagree.
- Pickers: `ctx.remote.directoryPicker.pick()` is the ONLY native dialog (there is no file
  chooser in the host). Folders (screenshotDir, browserProfile) get native Browse; file fields
  (browserCaCert, browserStateFile, browserExecutablePath) are an honest two-step — pick the
  containing folder, then a filename Menu from `list()` filtered by extension.
  browserExecutablePath also offers a **Detected browsers** Menu fed by a new status-route
  probe (`index.js` `detectedBrowsers()` — existsSync over Edge/Chrome/Brave/Chromium; measured
  here: Edge + Chrome).

### What was built (client.js ~905 L)

- First cut (9fb55d0) used the kit flat — Switch ×10, SegmentedControl ×4, Menu for
  browserTools/progressOverlayPosition, SettingsValueField + custom parse per field,
  ShortcutKeys record/clear — and the maintainer rejected it on VISUALS ("I do not approve,
  this looks less visually appealing than the original"). The page was house-correct but
  flat: one long column of identical rows. So a visual pass followed, patterned on screens
  the app itself ships (General, Agent presets, Remote & Mobile, Arya Plugin Market, bili,
  Hooks — screenshots in `.tmp-verify/cmp-*.png`): header = title + version Tag + mono
  package chip right; **pill tab strip** (Desktop lane · Takeover indicator · Progress
  overlay · Web lane · Status, one screenful per tab); bordered **cards** with bold internal
  headings and hairline-separated rows (Engine session / Call limits / Stop and resume;
  Indicator; Overlay / Position & size; Launch / Network & policy / Tool surface); **glyph
  cards** for Banner position (↑ ↓) and Overlay position (↖ ↗ ↙ ↘ ⌖) the way General picks
  Appearance; **compact right-aligned number inputs** the way General's font-size row does;
  **Status as three stat cards** with monospace fact lines the way bili's Overview does.
  Card/tab/number styling is inline flex on host tokens only (`0.5px solid
  var(--dsw-alias-border-l2)`, `var(--dsw-radius-lg)`, `var(--dsw-alias-bg-layer-1/-3)`,
  `var(--ds-font-family-code)`) — still zero feature-owned CSS.
- Kit controls: Switch ×10, SegmentedControl ×3 (toolPreset, progressOverlayMode,
  browserToolFlags), Menu for browserTools (labels carry the MEASURED counts — core · 33 …
  all · 160), SettingsValueField + custom parse for the text fields, ShortcutKeys
  record/clear for the two shortcuts, Resume Button (only while paused) inside the session
  stat card, DisclosureRow → JsonBlock + copy. The 62 keyed chat rows (rule 9) and the host
  half are untouched.
- Two real bugs found and fixed on Dev AryaCode:
  1. **`ctx.inject(['remote.directoryPicker'])` never fires.** The cordis proxy throws
     `cannot get property "directoryPicker" without inject` for subpath-only injects — the
     SERVICE name is what resolves. Fix: dual-path `ctx.inject(['remote',
     'remote.directoryPicker'], …)` (the host's own convention, ui-workspace index.ts:104).
     Evidence: Browse buttons went 0 → 2 in the DOM battery.
  2. **`model.edit is not a function`.** The kit exposes edit/resetField/discard ONLY through
     `actions()` (`form-model.ts:274`); `save` IS an instance method (:300). Our controls called
     them on the model object — every switch, menu and value edit threw, and the SettingsForm
     unmount cleanup (`onDiscard → model.discard`) threw THROUGH the host slot that renders the
     modal, so `sidebar.settings` ABDICATED and the Account menu vanished for the rest of the
     page session — initially misread as a first-party crash; the err.log line
     `slot entry crashed in 'sidebar.settings': TypeError: model.discard is not a function`
     names our member access. Fix: bind the three from `actions()` onto the instance after
     construction; `save` stays the async instance method so `runAction` can await it.
- Dev-host lessons (all cost a cycle): hot-swapping the package while the host runs POISONS the
  dev server's bundle cache (`web boot: 3 entries did not activate`) — always do a FULL electron
  restart after `pnpm remove`+`add`; CSS-module hashes change per build, so probes must be
  hash-free (labels, `data-slot`, `role`); the app's global Esc handler closes the top modal —
  probes close menus with a body `pointerdown` instead; `??` cannot mix with `||` unparenthesized
  in the page JS; `focus_window physical:true` refuses on the dev main window
  (`did not become foreground`), so CDP DOM paths, not OS keystrokes, drive the probes.

### Verification (V7/V8 re-run on the fixed bundle AND again on the visual-pass build; V1–V6/V9 stand from the 1.0.13 record)

- V7 status route (both builds): version 1.0.14, `engines.browsers` = Edge, Chrome, lease present,
  desktop `package-bin` / browser `platform-package`, 28/28 tools, mcp mounted.
- V8 battery (CDP DOM, Dev AryaCode, tarball installed in the dev profile) — first cut: five
  sections, 10 switches, 9 segmented tabs, Browse ×2, Choose-file ×3, Detected browsers ×1,
  Record ×2, Save/Discard, kbd ×2, Overridden tags ×2 + Reset ×2 (dev carry-overs), no invalid
  marks, status lines "agent-browser 0.43.0 · core · strip · platform package" / "agent-desktop
  1.3.1 · 28 / 28 · lite · 150000 ms" + elevation/lease chips. Screenshots:
  `.tmp-verify/v8-1014-page.png`, `.tmp-verify/v8-1014e-status.png`.
- V15 battery, RE-RUN on the visual-pass build (tab-gated, so the harness clicks
  `[data-arya-tab]` per panel): header title + version chip + package chip; tabs
  desktop/indicator/progress/browser/status; per-tab counts all as designed — switches 3+3+2+2,
  segmented 2+2+3 (glyph cards replaced the other two), nums (150000/800 · 800 ·
  60/360/240/80/80 · 0), iconCardRows indicatorPosition 2 (↑ Top pressed) +
  progressOverlayPosition 5 (↗ Top right pressed), Browse 1+1, Choose-file 3, Detected 1,
  Record 1+1, Overridden 2 (dev carry-overs), status stat cards read
  "agent-browser 0.43.0 / core · strip / platform package" and "agent-desktop 1.3.1 / 28 / 28 ·
  lite / 150000 ms / 800 ms" + unknown/present chips + session idle. Anomaly noted, not chased:
  the battery saw `saveEnabled: true` at fresh open (the kit's `save()` no-ops on an empty
  plan, so a stray click is harmless; every later probe showed correct gating and the Status
  screenshot shows the button grey). Screenshots of all five tabs:
  `.tmp-verify/v15-{desktop,indicator,progress,browser,status}.png` — reviewed by eye, the page
  reads house-native (cards, hairlines, pill tabs, glyph cards, mono facts).
- Interaction probes, all PASS on BOTH builds: toggle → staged draft flips the switch → Save
  enabled → persisted false through the write ladder → toggled back and restored true; invalid
  value ("5" in Per-call ceiling) → inline "must be between 10000 and 300000", `aria-invalid`,
  Save stays disabled, persisted value untouched; browserTools menu with all nine measured
  counts; Detected browsers menu (Edge + Chrome with paths); Browse → the native
  "Select Workspace Directory" dialog opened → cancelled semantically through the desktop lane
  (InvokePattern on Cancel) → draft unchanged, modal intact.
- Regression check for bug 2: after all of that, closing the modal left `sidebar.settings`
  rendering the normal Account launcher (no crash face) and the err.log had ZERO new
  `model.*`/`slot entry crashed` lines.
- V10 has NOT run for 1.0.14 — the release gates (release-plugin.mjs dry-run then real,
  catalogue parity, npmmirror sync) wait for the maintainer's go-ahead.

