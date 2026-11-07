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
- client.js REWRITTEN fresh slim (~430L, arya- prefix, NS 'aryaComputerUse.settings', kind 'arya-series', prefixes mcp__arya_desktop__, Lite-16 actionKeys, sections: indicator/progress/behavior(headedDefault/overlayDefault/driverLockEnabled)/stop; slots settings.section 'computer-use' order 16 + plugins.item/settings.plugin.item id 'arya-computer-use'; configForms.get('arya-computer-use') + settingsScope.bind namespace 'arya-computer-use'; mount() 4-path savePatch). ⚠️ node --check FAILS at client.js:369 (MouseToolRow return) 'SyntaxError: missing ) after argument list' — caret at `inspect && h('button'`. FIX PENDING: paren balance in MouseToolRow return; intended tree = details>[style,summary(mouseIcon,label,state),activityBody, inspect?button]. Restructure into multi-line, re-check.
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
