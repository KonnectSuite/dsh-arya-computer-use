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

