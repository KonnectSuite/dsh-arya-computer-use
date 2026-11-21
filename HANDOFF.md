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

## Held plan — 1.0.13 engine update + settings UI (2026-11-19)

The plan below is drafted, reviewed and **HELD**. Implementation starts only when issue #2
closes — explicit approval, or on/after 2026-11-24 (the date in comment 7024658122). Until
then: no dependency bump, no code edits, no version bump, no release. The repo stays at
`42f13d2` with a clean tree. This section is the plan as reviewed, plus the measurements it
rests on, so it can be executed cold without re-deriving anything.

### Why the engine bump is not a version bump

agent-browser 0.43.0 no longer ships its native beside the shim: its `bin/` holds only
`agent-browser.js` (2,707 B), and the executable arrives through `optionalDependencies`
(`@agent-browser/cli-win32-x64-msvc` → `bin/agent-browser.exe`, 20,043,776 B). So the 1.0.12
rule `join(dirname(SHIM), 'agent-browser-win32-x64.exe')` (`mcp/browser-launcher.mjs:50-63`)
finds nothing, the lane falls back to the npm shim, and **issue #2's console window comes
back**. Measured under pnpm (harnesses in `KonnectSuite/.tmp-verify/engines`): the 1.0.12
beside-the-shim rule → NOT FOUND; a plugin-anchored
`require.resolve('@agent-browser/cli-win32-x64-msvc/package.json')` → UNRESOLVABLE
(MODULE_NOT_FOUND); only an **engine-anchored** `createRequire` at the engine's own
`package.json` resolves it. agent-desktop 1.3.1 is the security bump (rustix 1.1.6 for
RUSTSEC-2026-0486, agent-desktop#670).

### Part A — engine update

- `package.json`: `:49-50` → `agent-browser 0.43.0`, `agent-desktop 1.3.1` (exact pins,
  AGENTS.md rule 4); `:3` version → `1.0.13`; `:44` `engines.node` `>=18` → `>=22` (0.43.0
  declares `>=22`; measured hosts: production AryaCode Node 24.21.0 / Electron 44.7.0, agent
  shell v26.1.0). Regenerate `package-lock.json` with `npm install --package-lock-only`
  (current pins `:13-14`, `:55-56`, `:69-70`; the new lock must carry the seven
  `@agent-browser/cli-*` entries). No new files, so `files` (`:21-42`) is unchanged.
- `mcp/browser-launcher.mjs`: `nativeBin()` (`:50-63`) becomes
  **`export async function nativeBin()`** with
  `const PKG_ROOT = dirname(require.resolve('agent-browser/package.json'))`; primary path
  `await import('agent-browser/scripts/native.js')` → `nativeTarget()` →
  `findNativeBinary(PKG_ROOT, target) ?? null` (upstream's own resolver: win32 always
  `@agent-browser/cli-win32-x64-msvc`, arm64 candidates
  `['agent-browser-win32-arm64.exe','agent-browser-win32-x64.exe']`, musl naming,
  engine-anchored `createRequire`, deliberately subprocess-free). Fallback when the engine has
  no `scripts/native.js` (≤0.42) or a future `exports` field blocks the import: the 1.0.12
  beside-the-shim ladder plus an engine-anchored platform-package attempt — and a shim
  fallback is never silent (the existing stderr line `:195-199`). Replace `isMusl()`
  (`:36-45`, `execSync('ldd --version')`) with a subprocess-free `hostLibc()` copy of the
  upstream technique (`process.report.excludeNetwork`, `report.header.glibcVersionRuntime`,
  `report.sharedObjects` regex, `/lib/ld-musl-<aarch64|x86_64>.so.1`), used only by the
  fallback. Make `SHIM` (`:32`) lazy so importing the module without agent-browser cannot
  throw (A3 imports it). `main()` (`:187`) becomes async and the `:225` guard calls
  `main().catch(...)`. Unchanged: `ensureExecutable` `:68-79`, the
  `env.AGENT_BROWSER_EXECUTABLE_PATH` block `:204-206`, the spawn branches `:207-209`, the
  flag-strip transform `:105-160`, signal handling `:220-222`.
- `index.js`: `engineBinaryReady` (`:119-131`) becomes engine-aware. agent-desktop keeps the
  `root/bin` `${platform}-${arch}` token scan. agent-browser: `await import('./mcp/browser-launcher.mjs')`
  → `await nativeBin()` → `binary:'platform-package'`; else the legacy scan
  (`'package-bin'`, covers a postinstall-downloaded exe and ≤0.42); else postinstall +
  re-check (`'downloaded'`). Without this, 0.43.0's empty `root/bin` makes the scan false →
  `ensureEngine` (`:133-149`) runs the vendor postinstall on **every start** (it finds the
  platform package, logs `✓ Native binary ready: @agent-browser/cli-win32-x64-msvc`, and does
  **not** copy the exe into `bin/`) → the re-scan is still false → status `ok:false` plus the
  `:353-356` warning. Keep the result shape `{package, ok, binary, reason?, message?}` for
  `mcpStatus` (`:62`, `:350`) and the status route (`:483`).
- `scripts/hide-consoles.ps1:38` PathPattern →
  `'\\node_modules\\(@agent-browser\\[^\\]+|agent-(browser|desktop))\\bin\\'` (the native now
  lives at `node_modules\@agent-browser\cli-win32-x64-msvc\bin\agent-browser.exe`). `:34`
  TitlePattern already matches `agent-browser.exe`.
- Verified as needing **no** change: `agent-desktop --help` 1.2.0 vs 1.3.1 differs only by the
  new `sandbox` command, and `lib/platform.js` still exports `resolve() → {binaryName,
  released}`, so `mcp/adapter-server.mjs:35-46` is untouched; `agent-browser mcp --help`
  differs only by a `structuredContent.response` doc paragraph, so every flag
  `browserArgs()` injects is intact; `skills/arya-desktop/SKILL.md` carries no version or
  tool-count claim.

### Part B — settings UI (every defect below is visible in the user's 2026-11-19 screenshot)

- **B1 duplicate disclosure label:** `client.js:335` and `:345` both render `t('appearance')`
  → "More indicator options" twice. Add `progressAppearance` (en "Overlay options", zh
  "浮窗选项") and use it at `:345`.
- **B2 broken icon:** `:364` reads
  `arts.monitor && arts.monitor(draft.browserHeaded) || arts.cursor(draft.browserHeaded)` —
  `arts.monitor` does not exist (`monitor` is a standalone helper at `:240`), so "Show the
  browser window" draws the ghost-cursor art. Add `arts.browser(on)` to the `arts` map
  (`:242-254`, built from `monitor()` + a browser-window frame/address bar) and call it
  directly.
- **B3 wrong tool count:** en `:92` "lite lists all 16 tools" / "lite · all 16" and zh `:39`
  "全部 16 个" vs the truth of **28** (`index.js:227`, README `:114`, and the gate-2 fact that
  the adapter exposes 28 tools). Fix both dictionaries and the stale comment at
  `mcp/adapter-server.mjs:151`.
- **B4 progress-panel detail is unreachable (behavior bug):** `index.js:204` is
  `progressOverlayMode: z.const('source').default('source')`, so `summary` cannot be stored —
  contradicting `mcp/settings.mjs:9` (default `'summary'`), `:42`
  (`SETTING_CHOICES.progressOverlayMode = ['source','summary']`), `:77`, and this file's own
  `:118`/`:125` record ("`source` painted the model's raw text on the desktop; default →
  `'summary'`"). README `:112` documents a setting the UI cannot set. Fix: `index.js:204` →
  union of `['source','summary']` with default `'summary'` (the pattern already at
  `:208`/`:227`/`:228`); `client.js:10` default → `'summary'`; add a segment control in the
  Progress overlay disclosure (`:345-351`) with new keys `progressMode` /
  `progressModeSummary` ("Summary — short action lines") / `progressModeSource` ("Raw model
  text") + zh mirrors. Caveat: a config that already persists `'source'` keeps it until the
  user switches — the point is that it is now visible and changeable.
- **B5 missing Resume affordance:** `resumeToken` is in the schema (`index.js:222`,
  `client.js:15`), `mcp/settings.mjs:90` treats it as a token field, and
  `mcp/takeover.mjs:145-147` resumes on a changed token
  (`if (this.config.resumeToken !== this.resumeToken && this.active === 0) { … this.paused =
  false; this.stoppedSeriesKey = null; this.blockedSeries.clear();
  this.persist('resumed-by-user'); }`) — yet the Stop section (`:372-380`) offers no resume
  control while `previewed` (zh `:32` / en `:106`) tells the user to "resume first". Add a
  **Resume control** button to the Stop section head (next to "Restore default (Esc)")
  running `run({ resumeToken: Date.now() }, 'resumed')` with new zh/en strings, disabled when
  `!writable || saving || recording`.
- **B6 inline validation:** `save()` (`:308-313`) rejects seven fields but reports one generic
  sentence (`t('invalid')` / `t('invalidBrowser')`). Tag the offending control with
  `data-arya-invalid` + `aria-invalid`, add a CSS rule in the `:137-209` block, and name the
  field in the message. Scope: `indicatorText`, `pointerLabel`, `indicatorIdleMs`,
  `browserSession`, `browserCdp`, `browserStateFile`, `browserExecutablePath` (the last two
  are where issue #1's reporter struggled).
- **B7 web-lane numbers and the stale token claim:** `browserToolsHint` (zh `:43` / en `:96`)
  states the 0.43.0 counts — core **33**, network 9, state 27, debug 40, tabs 13, react 8,
  mobile 15, all **64** (the published `all 156` is wrong for **both** engines; measured 64).
  `browserFlagsHint` (zh `:44` / en `:97`) — upstream #2311 lists only per-tool args, so
  `strip` removes **52 keys / 6,801 B ≈ 1.7k tokens**, not 406 keys / ~18k; keep the setting
  (still worth ~1.7k, and it keeps an older hoisted engine small). Drop the duplicated
  "applies after the next MCP restart" clause from both tooltips; keep the single `:371`
  caption.
- **B8 engine/status visibility (the biggest gap in the page).** Baseline, no plumbing and no
  drift: a caption under the header with new keys `lanes` / `lanesHint` ("Two lanes: desktop
  (`agent-desktop`) and web (`agent-browser`).") + zh mirror, and **no** version numbers in the
  UI. Spike, behind silent degradation: a collapsed *Status* disclosure at the bottom that
  fetches this plugin's own status route (`GET /plugins/arya/status?token=…`, same origin as
  the renderer, token from `window.__DSH_BOOT__`) and renders plugin version, `mcp.engines`
  per package (`ok` + `binary`/`reason`), `mcp.servers`, `takeover.paused` / `seriesActive`,
  and the effective `browserExecutablePath` — exactly the data that makes an issue-#2-class
  problem self-diagnosable. Acceptance: if the fetch fails, the token is unavailable, or the
  payload shape is unexpected, render one "Status unavailable" line and leave the form
  untouched; if the `__DSH_BOOT__` token field or same-origin reachability fails at
  implementation time, ship the baseline only and record the follow-up here.
- **B9 new web tool rows:** `browserActionKeys` (`:386`) gains `flow_run`, `flow_save`,
  `flow_list`, `flow_steps` with new label keys `flowRun` / `flowSave` / `flowInspect` in both
  dictionaries (zh `:70-73`, en `:123-126`). Wire keys stay
  `mcp__arya_browser__agent_browser_<name>` (AGENTS.md rule 9) → 33 web rows + 16 desktop rows.

### Part C — docs and records

`AGENTS.md:50-51` (rule 4 versions); `NOTICE.md:7,11`; `README.md:209,212` +
`README.zh.md:190,193`; `README.md:115` / `README.zh.md:100` tool-profile table (core 33, all
64); `README.md:65-68` / `README.zh.md:57` install guidance — agent-browser's native now
arrives as an **optional dependency** (pnpm installed the platform package while still
reporting `[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: agent-browser@0.43.0`), so only
`agent-desktop` needs an approved build; `docs/PLAN.md:3,105,106` stay (design history, rule
10); `CHANGELOG.md` new `## 1.0.13 — <release date>` covering both halves; this file's
post-release record. Release shape decided: **one 1.0.13 containing both halves** (one gate-2
pass and one gate-4 run; the UI fixes are string/icon-level). Alternative if the maintainer
prefers: 1.0.13 engine-only, then 1.1.0 for the UI.

### Verification (all seven, in order)

1. Resolution matrix: re-run `.tmp-verify/engines/probe-in-plugin.mjs` against the repo
   `node_modules` (npm flat) and `install-pnpm/myplugin` (pnpm strict) — `nativeBin()` must
   return `…\@agent-browser\cli-win32-x64-msvc\bin\agent-browser.exe` in both, and the
   beside-the-shim path for a 0.41.2 install.
2. Launcher end-to-end: `Win32_Process` shows the child as `agent-browser.exe` with **no
   node+shim rung**; `tools/list` = 33 core tools; the strip transform still removes keys.
3. Console windows: `issue2-console-windows.ps1` with the widened pattern → 0 visible engine
   windows, with the 1.0.11 production profile as the positive control (never trust a bare
   zero — see `:485-488`).
4. AGENTS.md rule 9 replay: `.tmp-verify/toolview-keys.mjs` extended to 33 browser names →
   PASS (49 keys, no bare key, no keyed-slot collision).
5. Status route reports both engines ready with `binary:'platform-package'` for agent-browser.
6. Gate 2 manual dev AryaCode pass (rule 2 of `dsh-arya-market/AGENTS-PLUGINS.md`): packed
   tarball via `pnpm remove` + `pnpm add file:<tarball>`; launch with `ARYACODE_REPO`,
   `ELECTRON_DISABLE_SANDBOX=1`, `DSH_DESKTOP_RENDERER_DEBUG_PORT=9333`, stdin from `NUL`;
   drive one window through a ref with the harness's own scratch file (Win11 Notepad is
   single-instance — target only the window you own), load one page
   (`gate2c-e2e-installed.mjs`: msedge count rises and falls, UA carries `Edg/`), press Esc
   and see it stop; **then open Settings and exercise B1-B8** (no duplicate label, correct
   browser-window icon, preset says 28, progress detail switchable and effective, Resume
   un-pauses a stopped series, an invalid browser path flags inline, the Status disclosure
   renders or degrades).
7. Gate 4: `node ../dsh-arya-market/scripts/release-plugin.mjs --dry-run`, then the real run
   from a clean committed tree; verify the five AGENTS.md release gates; npmmirror sync with
   the working form
   `PUT https://registry.npmmirror.com/-/package/@aryacode%2Fdsh-plugin-arya-computer-use/syncs`;
   record here; commit + push. On an npm propagation timeout re-run the same command (the
   already-published guard finishes the rest) — never hand-edit `index.json`, never hand-cut
   the tag, never re-publish a version.

### Risks, decisions, assumptions

- **win32-arm64:** no `@agent-browser/cli-win32-arm64` package exists; upstream prefers a
  source-built `agent-browser-win32-arm64.exe` then the x64 exe through Windows emulation;
  the win32-x64-msvc package declares `cpu:["x64","arm64"]`. Verified from manifests only — no
  arm64 host here. **musl/Alpine:** chosen by the engine's `hostLibc()`; untestable here.
- A profile hoisting an older agent-browser is covered by the fallback ladder; an upstream
  `exports` field would force the fallback plus the stderr line, never a silent shim.
- `engines.node >=22` could refuse a pre-22 host (measured production is 24.21.0) — flagged
  assumption.
- The four `flow_*` tools are **accepted as upstream core** rather than filtered out:
  `flow_run` exposes `allowWrite`, and the web lane has no consent gate equivalent to
  `physicalAllowed`; filtering would be new machinery this plugin does not have.
- agent-desktop's new `sandbox` command stays out of scope. agent-desktop#602 may change
  desktop error kinds — verify during the gate-2 pass, no code change planned.
- B8's Status spike depends on a renderer→status-route fetch working; it is explicitly allowed
  to degrade to a single line.

### Measured evidence the plan rests on (2026-11-19, do not re-derive)

- pnpm resolution matrix: 1.0.12 beside-the-shim rule NOT FOUND; plugin-anchored
  `@agent-browser/cli-win32-x64-msvc/package.json` resolve UNRESOLVABLE (MODULE_NOT_FOUND);
  engine-anchored `createRequire` resolves.
- `tools/list` through the launcher: **29 → 33** core tools on 0.43.0; the four new names are
  `flow_run`, `flow_save`, `flow_list`, `flow_steps`.
- Flag-strip economics on 0.43.0: `strip` removes **52 keys / 73,595 B → 6,801 B** of schema
  (406 keys was the 0.41.2 number); profile `all` measures **64** tools, so README's 156 was
  already wrong for the pinned 0.41.2 engine.
- `AGENT_BROWSER_EXECUTABLE_PATH` is still honored in `mcp` mode (UA
  `HeadlessChrome/157.0.0.0 … Edg/157.0.0.0`) while `--executable-path` is still **ignored**
  there — the comment at `mcp/browser-launcher.mjs:200-206` stays correct. An
  engine-version warning also appears on a stale Chrome
  (`Chrome 156.0.8078.82 is behind the current stable release 158.0.8127.36`).
- `agent-desktop --help` 1.2.0 vs 1.3.1: only the new `sandbox` command differs.

### Out of scope (open threads this plan does not close)

- The deferred **issue #2** close — explicit approval or on/after 2026-11-24.
- The production AryaCode profile stays on 1.0.11 until the catalogue reaches it.
- Live engine diagnostics beyond B8's spike; the headed-mode gap (`:413-422`).
