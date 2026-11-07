# Arya Computer Use — Handoff Notes (2026-11-07 ~01:10)

Repo: C:\Users\KNPhu\AryaCode\KonnectSuite\dsh-arya-computer-use (git main, pushed; latest commit 16b940a).
Bundle: @konnectsuite/dsh-plugin-arya-computer-use 0.1.0, installed via plugin_manager install_bundle (link: source — keep checkout in place). Restart required to apply row changes.

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
3. plugin_manager remove_bundle @konnectsuite/dsh-plugin-arya-computer-use then install_bundle (reinstall required to re-read new files/manifest; 'already-installed' blocks plain reinstall).
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
