#!/usr/bin/env node
/**
 * Arya Computer Use adapter — Lite tool surface over the agent-desktop CLI.
 *
 * Why a proxy: agent-desktop's own MCP server fixes global flags (--session,
 * --headed) at server start. This adapter spawns the CLI per call so it can
 * inject per-conversation session ids, the headed toggle, and manage the
 * cursor overlay lifecycle. It also owns the tool surface (DSH's MCP client
 * registers every tool a server exposes, with no filtering), adds OCR
 * (agent-desktop has none) and screenshot-to-file, and surfaces the
 * elevation requirement as a readable diagnostic.
 *
 * Tool names register as mcp__arya_desktop__<name>.
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { runQuietPointer, windowHandle } from './quiet-input.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const CLI_BIN = require.resolve('agent-desktop/bin/agent-desktop');
const OCR_PS1 = join(HERE, '..', 'scripts', 'ocr.ps1');

// Windows console-window trap, the same one browser-launcher.mjs documents and
// avoids: bin/agent-desktop (the npm shim) spawns the native exe with
// stdio:'inherit' + windowsHide:false, so every tool call pops a console window
// on the user's desktop. Spawn the native binary directly instead; stdio stays
// piped and windowsHide holds. Null when the platform has no released binary,
// in which case the shim is the only way to run the CLI.
const NATIVE_BIN = (() => {
  try {
    const pkgDir = dirname(require.resolve('agent-desktop/package.json'));
    const { resolve } = require('agent-desktop/lib/platform');
    const entry = resolve(process.platform, process.arch);
    if (!entry || !entry.released || !entry.binaryName) return null;
    const bin = join(pkgDir, 'bin', entry.binaryName);
    return existsSync(bin) ? bin : null;
  } catch {
    return null;
  }
})();

// Engine state root: the engine's own default (~/.agent-desktop) — it creates
// that root with its protected DACL and passes its private-file checks.
// Do NOT point AGENT_DESKTOP_HOME at AppData\Local: inherited AppContainer ACEs
// there fail the engine's 'private file DACL grants an untrusted principal' check.
const ENGINE_STATE_ROOT =
  process.env.AGENT_DESKTOP_HOME || join(process.env.USERPROFILE || HERE, '.agent-desktop');
const LOCAL_APPDATA = process.env.LOCALAPPDATA || join(process.env.USERPROFILE || HERE, 'AppData', 'Local');
const PLUGIN_DIR = join(LOCAL_APPDATA, 'dsh-plugin-arya-desktop');
const SHOTS_DIR = join(PLUGIN_DIR, 'screenshots');
mkdirSync(SHOTS_DIR, { recursive: true });

// Behavior switches live in the host plugin's control file (settings.register
// 'arya-computer-use' → index.js writes it here). The adapter polls it so
// changes apply to the next call without restarting the MCP connection.
const SETTINGS_FILE = join(PLUGIN_DIR, 'control', 'settings.json');
// The overlay host reads this to frame the app window that is being driven and
// to place the ghost cursor where the harness acts — never the real pointer.
const TARGET_FILE = join(PLUGIN_DIR, 'control', 'target.json');
// The host takeover lane persists its paused/stopped series here. The adapter
// watches it so the user's Esc stop also drops the physical-input latch.
const TAKEOVER_STATE_FILE = join(PLUGIN_DIR, 'control', 'state.json');
// The host publishes the current turn's activity lease here. The adapter reads it
// to recompute the same series key the takeover lane blocks a stopped series on.
const ACTIVITY_FILE = join(PLUGIN_DIR, 'control', 'activity.json');

const VERSION = '0.1.0';
const MAX_BATCH = 20;

// The engine's own batch runs entries in one process, through the same policy
// checks and dispatch as the CLI. Entry keys are the command's own field names: a
// positional is named after itself, a flag drops `--` and writes `-` as `_`
// (skills/agent-desktop/references/commands-system.md:170). Unknown keys are
// rejected, so each action declares the keys it forwards.
const NATIVE_BATCH_COMMANDS = new Map([
  ['snapshot', 'snapshot'], ['find', 'find'], ['get', 'get'], ['is', 'is'],
  ['set_value', 'set-value'], ['press', 'press'],
  ['scroll', 'scroll'], ['scroll_to', 'scroll-to'], ['wait', 'wait'],
  ['select', 'select'], ['check', 'check'], ['uncheck', 'uncheck'], ['clear', 'clear'],
  ['expand', 'expand'], ['collapse', 'collapse'], ['toggle', 'toggle'],
]);
// A step whose delivery the adapter has to decide per call (a click that may need
// a semantic fallback or a posted click, a physical action that needs consent, a
// file the adapter owns) runs through callTool one at a time. The engine's
// --headed is global and applies to every native batch entry, so those steps can
// never share one native batch with semantic steps.
const LOOP_BATCH_ACTIONS = new Set(['click', 'type', 'screenshot', 'ocr', 'focus', 'double_click', 'right_click']);
const BATCH_ARG_KEYS = {
  snapshot: ['app', 'window_id', 'compact', 'skeleton', 'interactive_only', 'max_depth', 'root', 'timeout_ms'],
  find: ['app', 'window_id', 'name', 'role', 'text', 'value', 'native_id', 'description', 'first', 'last', 'nth', 'limit', 'count', 'exact', 'root', 'timeout_ms'],
  get: ['ref_id', 'property'],
  is: ['ref_id', 'property'],
  click: ['ref_id', 'timeout_ms', 'physical'],
  focus: ['ref_id', 'timeout_ms', 'physical'],
  double_click: ['ref_id', 'timeout_ms', 'physical'],
  right_click: ['ref_id', 'timeout_ms', 'physical'],
  type: ['ref_id', 'text', 'interval_ms', 'timeout_ms', 'physical'],
  expand: ['ref_id', 'timeout_ms'],
  collapse: ['ref_id', 'timeout_ms'],
  toggle: ['ref_id', 'timeout_ms'],
  select: ['ref_id', 'value', 'timeout_ms'],
  check: ['ref_id', 'timeout_ms'],
  uncheck: ['ref_id', 'timeout_ms'],
  clear: ['ref_id', 'timeout_ms'],
  scroll_to: ['ref_id', 'timeout_ms'],
  set_value: ['ref_id', 'value', 'timeout_ms'],
  press: ['combo', 'app', 'window_id', 'force'],
  scroll: ['ref_id', 'direction', 'amount', 'timeout_ms'],
  wait: ['ms', 'app', 'window', 'element', 'text', 'timeout'],
};

function batchEntryArgs(action, args) {
  const entry = {};
  for (const key of BATCH_ARG_KEYS[action] ?? []) {
    const value = action === 'wait' && key === 'timeout' ? (args.timeout ?? args.timeout_ms) : args[key];
    if (value === undefined || value === null) continue;
    entry[key] = value;
  }
  return entry;
}

// A batch entry keeps its payload — a find step must yield refs — but a snapshot
// tree is the largest thing the engine can return, and the batch cap allows 4 MB.
function trimBatchData(data) {
  if (!data || !Array.isArray(data.results)) return data;
  return {
    ...data,
    results: data.results.map((entry) => (
      entry?.command === 'snapshot' && entry.data?.tree
        ? { ...entry, data: { ...entry.data, tree: undefined, tree_omitted: true } }
        : entry
    )),
  };
}

const state = {
  sessionId: `arya-${randomBytes(4).toString('hex')}`,
  sessionStarted: false,
  headedOverride: null, // tools {operation:'headed'} per-conversation toggle
  headedExpiresAt: 0, // headedOverride self-releases: a latch left on is a mouse/keyboard takeover
  overlayOverride: null,
  headedDefault: false,
  overlayDefault: true,
  windowId: null,
  toolPreset: 'lite', // 'lite' = all 16 tools, 'lazy' = three to start, rest on demand
  extraTools: new Set(), // tools revealed by tools {operation:'load'} in the lazy preset
};

// The lazy preset starts with the three tools needed to look, read, and act
// once; everything else is revealed through `tools {operation:'load'}` and a
// tools/list_changed notification. The harness re-syncs on that notification
// (dsh-mcp-client wires listChanged.onChanged → refreshTools).
const LAZY_CORE = ['tools', 'snapshot', 'click'];
const exposedTools = () => (state.toolPreset === 'lazy'
  ? TOOLS.filter((tool) => LAZY_CORE.includes(tool.name) || state.extraTools.has(tool.name))
  : TOOLS);

function notifyToolsChanged() {
  // Advertised through capabilities.tools.listChanged; the client re-lists and
  // swaps its registered tool generation.
  send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
}
// A headed latch left on makes EVERY later call physical (runCli appends
// --headed to all of them), so it releases on its own. Per-call --headed is the
// normal path; the latch is only an escape hatch for surfaces that need a
// sequence of physical actions.
const HEADED_LEASE_MS = 5 * 60 * 1000;
const effectiveHeaded = () => {
  if (state.headedOverride === true && Date.now() > state.headedExpiresAt) {
    state.headedOverride = null;
    state.headedExpiresAt = 0;
  }
  return state.headedOverride ?? state.headedDefault;
};
const effectiveOverlay = () => state.overlayOverride ?? state.overlayDefault;

setInterval(() => {
  try {
    const settings = JSON.parse(readFileSync(SETTINGS_FILE, 'utf8'));
    // Strict: a settings file that omits the key must mean OFF. `!== false`
    // read a missing key as ON, which is a silent mouse/keyboard takeover.
    state.headedDefault = settings.headedDefault === true;
    state.overlayDefault = settings.overlayDefault !== false;
    const preset = settings.toolPreset === 'lazy' ? 'lazy' : 'lite';
    if (preset !== state.toolPreset) {
      state.toolPreset = preset;
      state.extraTools.clear();
      notifyToolsChanged();
    }
  } catch {
    // Settings file not written yet (plugin not loaded): keep the defaults.
  }
  try {
    // Esc / stop lives in the host lane. A stopped series means the user pushed
    // back: release the headed latch so the next series starts headless.
    const takeover = JSON.parse(readFileSync(TAKEOVER_STATE_FILE, 'utf8'));
    if (takeover?.paused === true && state.headedOverride === true) {
      state.headedOverride = null;
      state.headedExpiresAt = 0;
    }
  } catch {
    // No takeover state yet.
  }
}, 1000).unref();

/* ---------------------------------------------------------- user stop */

// Esc lives in the host takeover lane: it blocks the series it was acting for,
// keyed by [sessionId, turn] from the activity lease (mcp/takeover.mjs:111,184).
// The adapter is a separate process, so it recomputes that key and refuses every
// input action for a blocked series. The banner says "Esc Stop"; until now the
// driver never honoured it. Reads stay available — the user asked to stop being
// driven, not to be observed. A new user turn is a new key, so the block releases
// exactly as it does in the host lane, with no settings change.
const STOPPED_BY_USER = 'COMPUTER_USE_STOPPED_BY_USER: The user stopped this operation series with Esc or their custom shortcut. Do not retry desktop input in this turn. A new user turn, including a request to continue, can use the desktop automatically; no settings change is required.';
const INPUT_TOOLS = new Set(['click', 'set_value', 'type', 'press', 'scroll', 'launch', 'focus', 'double_click', 'right_click', 'expand', 'collapse', 'toggle', 'batch']);

function stoppedSeriesMessage() {
  try {
    const activity = JSON.parse(readFileSync(ACTIVITY_FILE, 'utf8'));
    if (!(activity.active === true && Number.isFinite(activity.expiresAt) && activity.expiresAt > Date.now())) return null;
    const saved = JSON.parse(readFileSync(TAKEOVER_STATE_FILE, 'utf8'));
    const key = JSON.stringify([activity.sessionId, activity.turn]);
    if (saved?.blockedSeries && Object.prototype.hasOwnProperty.call(saved.blockedSeries, key)) return saved.blockedSeries[key];
    return saved?.paused === true && saved?.stoppedSeriesKey === key ? (saved.pauseMessage || STOPPED_BY_USER) : null;
  } catch {
    return null; // no lease published yet: nothing has been stopped
  }
}

function stoppedResult(name, message) {
  return envelopeResult({
    version: '2.6',
    ok: false,
    command: name,
    error: {
      code: 'POLICY_DENIED',
      message,
      suggestion: 'Do not retry desktop input in this turn. Report that the user stopped the takeover; a new user turn can drive the desktop again.',
      details: { kind: 'stopped_by_user' },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  });
}

/* ------------------------------------------------------- overlay target */

// The overlay frames the app window that is being driven and puts the ghost
// cursor where the harness acts. Both come from what the engine reports, so the
// user's own pointer is never read, moved or highlighted.
const windowBounds = new Map(); // window id -> {left, top, width, height}
let windowBoundsAt = 0;

function rememberWindows(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.windows) ? data.windows : data?.window ? [data.window] : [];
  for (const window of list) rememberWindow(window);
}

function rememberWindow(window) {
  if (!window || !window.id || !window.bounds) return null;
  const b = window.bounds;
  const rect = { left: Number(b.x), top: Number(b.y), width: Number(b.width), height: Number(b.height) };
  if (![rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  windowBounds.set(window.id, rect);
  return rect;
}

async function windowRectFor(id) {
  if (!id) return null;
  const cached = windowBounds.get(id);
  if (cached) return cached;
  if (Date.now() - windowBoundsAt < 2000) return null;
  try {
    const envelope = parseEnvelope(await runCli(['list-windows']));
    if (envelope?.ok) {
      rememberWindows(envelope.data);
      windowBoundsAt = Date.now();
    }
  } catch { /* the hint is optional */ }
  return windowBounds.get(id) ?? null;
}

async function elementPoint(ref) {
  try {
    const envelope = parseEnvelope(await runCli(['get', ref, ...flagArgs([['--property', 'bounds']])]));
    const value = envelope?.data?.value;
    if (!value) return null;
    const x = Number(value.x), y = Number(value.y), width = Number(value.width), height = Number(value.height);
    if (![x, y, width, height].every(Number.isFinite)) return null;
    return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
  } catch { return null; }
}

/* ------------------------------------------------------------ ref index */

// A click can be refused on a control that advertises the action but exposes
// neither InvokePattern nor a Legacy default action. What that ref advertised at
// snapshot time is the only evidence the adapter can retry under a different
// pattern (select/toggle/expand/collapse), so the last snapshot's tree is
// indexed here. Identity fields only: values and bounds are never cached, so a
// stale ref is never papered over — its alternative is tried and fails like the
// click did.
const refIndex = new Map(); // ref -> { role, name, actions: string[], windowId }

function indexNode(node, windowId) {
  if (!node || typeof node !== 'object') return;
  if (node.ref_id) {
    refIndex.set(String(node.ref_id), {
      role: String(node.role ?? ''),
      name: typeof node.name === 'string' ? node.name : '',
      actions: Array.isArray(node.available_actions) ? node.available_actions.map(String) : [],
      windowId,
    });
  }
  if (Array.isArray(node.children)) for (const child of node.children) indexNode(child, windowId);
}

function indexSnapshot(data, fallbackWindowId) {
  if (!data || !data.tree) return;
  indexNode(data.tree, data.window?.id ?? fallbackWindowId ?? null);
}

function refRecord(ref) {
  return refIndex.get(String(ref ?? '')) ?? null;
}

// Role groups for the semantic patterns that can stand in for a click. The
// action vocabulary is core's own (crates/core/src/actions/action.rs as_str).
const SELECT_AS_OPTION_ROLES = new Set(['tabitem', 'listitem', 'option', 'radiobutton', 'treeitem', 'menuitem', 'combobox', 'listbox']);
const TOGGLE_ROLES = new Set(['checkbox', 'switch', 'togglebutton']);
const EXPAND_ROLES = new Set(['treeitem', 'disclosure', 'combobox', 'button', 'group']);

/* -------------------------------------------------------- physical input */

// Physical input is the one thing the user must opt into: it moves the real
// pointer and takes the desktop foreground. `physical: true` on one call is that
// opt-in; `tools {operation:"headed", on:true}` is the conversation-wide opt-in
// that expires on its own. Without either, nothing here runs.
function physicalAllowed(args) {
  return args?.physical === true || state.headedOverride === true;
}

function physicalRefusal(command, what) {
  return {
    version: '2.6',
    ok: false,
    command,
    error: {
      code: 'POLICY_DENIED',
      message: `${what} needs physical input, which moves the user's mouse and takes the desktop foreground. It does not run unless you ask for it.`,
      suggestion: 'Use the headless path the message names instead, or pass physical:true on this one call when the user has agreed to hand over the mouse and keyboard. tools {operation:"headed",on:true} opts the whole conversation in for five minutes.',
      details: { kind: 'physical_input_requires_consent', physical: false },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  };
}

function withMechanism(envelope, mechanism, attempted = [], note = '', extra = null) {
  if (envelope?.ok !== true) return envelope;
  envelope.data = {
    ...(envelope.data ?? {}),
    mechanism,
    ...(attempted.length ? { attempted } : {}),
    ...(extra ? { fallback_from: extra } : {}),
    ...(note ? { note } : {}),
  };
  return envelope;
}

// What the engine said when its semantic call was refused. Kept on the envelope
// that eventually succeeded, because "the click worked, but by another rung" is
// exactly the fact an operator or a later diagnosis needs.
function refusalSummary(envelope) {
  const error = envelope?.error;
  if (!error) return null;
  return { code: error.code ?? null, message: error.message ?? null, kind: error.details?.kind ?? null };
}

// The engine's physical commands require the target window to be foreground
// already ("Target window did not become foreground before headed delivery") and
// no background process can satisfy the Windows foreground lock. Under explicit
// consent only, a real click at the element's centre is what raises the window;
// this is the pointer-stealing step the plugin used to run on every `type`.
async function promoteForPhysical(refId) {
  const point = await elementPoint(refId);
  if (!point) return null;
  const envelope = parseEnvelope(await runCli(['mouse-click', '--xy', `${point.x},${point.y}`], { headed: true }));
  return envelope.ok === true ? null : envelope;
}

// A refused engine call can mean two different things: the target does not
// support the action, or the exclusive desktop interaction lease is held by
// another engine action (`launch` holds it until its window appears). The
// second is contention, so it must not be reported as "this click failed".
const LEASE_BUSY_NOTE = 'The desktop interaction lease is held by another engine action right now (a launch holds it until its window appears), so no engine call can run. Nothing touched the mouse or the keyboard.';

function leaseBusy(envelope) {
  const summary = refusalSummary(envelope);
  return summary?.kind === 'lock_timeout' ? summary : null;
}

// Physical pointer delivery at the element centre: one real OS click, which also
// raises the target window as a side effect. mouse-click has no --timeout-ms.
async function physicalPointer(command, refId) {
  const point = await elementPoint(refId);
  if (!point) return null;
  const shape = command === 'double_click' ? ['--count', '2'] : command === 'right_click' ? ['--button', 'right'] : [];
  const envelope = parseEnvelope(await runCli(['mouse-click', '--xy', `${point.x},${point.y}`, ...shape], { headed: true }));
  return withMechanism(envelope, 'physical_synthetic', [], 'Physical input: the real pointer moved and the target window took the foreground.');
}

/* -------------------------------------------------------- posted pointer */

// Background pointer delivery: post WM_* messages to the target control, so the
// click lands with the cursor and the foreground exactly as the user left them.
// Engine-reported window ids are `w-<hwnd>`; the ref's own window is preferred
// because state.windowId is only the last window the adapter touched.
async function postedPointer(command, refId, mode) {
  const point = await elementPoint(refId);
  if (!point) return { envelope: null, reason: 'element bounds unavailable (stale ref?)' };
  const hwnd = windowHandle(refRecord(refId)?.windowId ?? state.windowId);
  if (!hwnd) return { envelope: null, reason: 'no window handle for this ref: take a fresh snapshot so the adapter knows its window' };
  const report = await runQuietPointer({ mode, hwnd, x: point.x, y: point.y });
  if (!report || report.ok !== true) return { envelope: null, reason: report?.error || 'posted click failed' };
  return {
    envelope: {
      version: '2.6',
      ok: true,
      command,
      data: {
        action: command,
        mechanism: 'post_message',
        steps: [{
          label: mode === 'right' ? 'PostMessage.WM_RBUTTON' : mode === 'double' ? 'PostMessage.WM_LBUTTONDBLCLK' : 'PostMessage.WM_LBUTTON',
          mechanism: 'background_synthetic',
          outcome: 'succeeded',
          verified: false,
        }],
        disposition: { delivery: 'delivered_unverified', retry: 'unsafe' },
        pointer: { cursor_moved: report.cursor_moved === true, foreground_changed: report.foreground_changed === true },
        target: report.target ?? null,
        note: 'Background click: posted to the control window, so the user’s mouse and foreground were left alone. Verify by re-reading the control; delivered_unverified means nothing saw the result yet.',
      },
    },
    report,
  };
}

async function trySemanticAlternatives(refId, timeoutMs) {
  const record = refRecord(refId);
  const attempted = [];
  if (!record) return { envelope: null, attempted, mechanism: null };
  const flags = flagArgs([['--timeout-ms', timeoutMs]]);
  const run = async (command, extra = []) => {
    const envelope = parseEnvelope(await runCli([command, refId, ...extra, ...flags]));
    attempted.push({ command, ok: envelope.ok === true, code: envelope.error?.code });
    return envelope.ok === true ? envelope : null;
  };
  if (record.actions.includes('select') && SELECT_AS_OPTION_ROLES.has(record.role) && record.name) {
    const envelope = await run('select', [record.name]);
    if (envelope) return { envelope, attempted, mechanism: 'select' };
  }
  if (record.actions.includes('toggle') && TOGGLE_ROLES.has(record.role)) {
    const envelope = await run('toggle');
    if (envelope) return { envelope, attempted, mechanism: 'toggle' };
  }
  if (record.actions.includes('expand') && EXPAND_ROLES.has(record.role)) {
    const envelope = await run('expand');
    if (envelope) return { envelope, attempted, mechanism: 'expand' };
  }
  if (record.actions.includes('collapse') && EXPAND_ROLES.has(record.role)) {
    const envelope = await run('collapse');
    if (envelope) return { envelope, attempted, mechanism: 'collapse' };
  }
  return { envelope: null, attempted, mechanism: null };
}

function annotateRefusal(envelope, attempted, postedReason) {
  if (envelope?.ok === true) return envelope;
  const parts = [];
  if (attempted.length) parts.push(`the ref's own patterns refused: ${attempted.map((a) => `${a.command}(${a.code ?? 'failed'})`).join(', ')}`);
  if (postedReason) parts.push(`a background posted click could not run: ${postedReason}`);
  envelope.hint = [
    'Nothing physical ran: the user’s mouse and foreground were not touched.',
    parts.length ? parts.join('; ') + '.' : '',
    'Options: take a fresh snapshot and re-read available_actions; drive the control with select/check/uncheck/toggle/expand/scroll_to; or pass physical:true on this one call if the user agreed to hand over the mouse and keyboard.',
  ].filter(Boolean).join(' ');
  return envelope;
}

function writeTarget(window, pointer) {
  try {
    const payload = JSON.stringify({ window: window ?? null, pointer: pointer ?? null, at: Date.now() });
    if (payload === state.lastTarget) return;
    state.lastTarget = payload;
    mkdirSync(dirname(TARGET_FILE), { recursive: true });
    const temp = `${TARGET_FILE}.${process.pid}.tmp`;
    writeFileSync(temp, payload);
    renameSync(temp, TARGET_FILE);
  } catch { /* the overlay is optional */ }
}

async function noteTarget(name, args, result) {
  const envelope = result?.structuredContent ?? (result && typeof result === 'object' && 'ok' in result ? result : null);
  const data = envelope?.ok === true ? envelope.data : null;
  if (name === 'launch' && data?.window) {
    rememberWindow(data.window);
    if (data.window.id) state.windowId = data.window.id;
  }
  if (name === 'list_windows') rememberWindows(data);
  if (name === 'snapshot') rememberWindows(data);
  if (args?.window_id) state.windowId = args.window_id;
  // target.json feeds the rim and the ghost cursor only. With the overlay off,
  // skip the CLI calls they cost (element bounds, sometimes a window list):
  // ~85-140 ms per action spent on presentation nobody is looking at.
  if (!effectiveOverlay() || !state.windowId) return;
  const window = await windowRectFor(state.windowId);
  const ref = args?.ref_id ?? data?.match?.ref_id ?? null;
  let pointer = ref ? await elementPoint(ref) : null;
  if (!pointer && window) pointer = { x: Math.round(window.left + window.width / 2), y: Math.round(window.top + window.height / 2) };
  writeTarget(window, pointer);
}

/* ------------------------------------------------------------------ CLI */

// Semantic delivery only: --headed is passed by the few call sites that already
// established the user's consent (physicalAllowed), so no ordinary call can
// silently move the pointer or take the foreground.
//
// A hard ceiling exists because every engine call runs under this one queue: an
// engine that stops answering (a stuck window probe, a lease it never gets)
// would otherwise wedge every later tool call for the rest of the conversation.
const CLI_HARD_TIMEOUT_MS = 150000;

function hardTimeoutEnvelope(args) {
  return JSON.stringify({
    version: '2.6',
    ok: false,
    command: String(args[0] ?? ''),
    error: {
      code: 'TIMEOUT',
      message: `The engine did not answer within ${Math.round(CLI_HARD_TIMEOUT_MS / 1000)} s and was stopped.`,
      suggestion: 'The desktop may be showing a modal dialog or the interaction lease may be held by another app; retry once, and report it if it repeats.',
      details: { kind: 'adapter_hard_timeout' },
      disposition: { delivery: 'not_delivered', retry: 'safe' },
    },
  });
}

function runCli(args, { headed = false } = {}) {
  const argv = [];
  if (headed) argv.push('--headed');
  argv.push(...args);
  const env = { ...process.env };
  if (state.sessionStarted) env.AGENT_DESKTOP_SESSION = state.sessionId;
  return new Promise((resolve) => {
    const child = NATIVE_BIN
      ? spawn(NATIVE_BIN, argv, {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env,
        })
      : spawn(process.execPath, [CLI_BIN, ...argv], {
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
          env,
        });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      settled = true;
      resolve({ code: -2, stdout: hardTimeoutEnvelope(args), stderr });
    }, CLI_HARD_TIMEOUT_MS);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code: -1, stdout: '', stderr: String(error?.message || error) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    });
  });
}

// Serialize all CLI calls: the engine's interaction lease allows one driver
// at a time, and queueing here avoids contending on the kernel lock.
let queue = Promise.resolve();
function enqueue(fn) {
  const run = queue.then(fn, fn);
  queue = run.then(() => {}, () => {});
  return run;
}

function parseEnvelope({ code, stdout, stderr }) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try {
      return JSON.parse(stdout.slice(start, end + 1));
    } catch {}
  }
  return {
    version: '2.6',
    ok: false,
    error: {
      code: 'ADAPTER_CHILD_FAILURE',
      message: `agent-desktop exited with code ${code}${stderr ? `: ${stderr.trim().slice(0, 400)}` : ''}`,
      details: { kind: 'child_exit', exit_code: code },
    },
  };
}

const ELEVATION_HINT =
  ' The interaction lease requires the DSH host to run elevated (as Administrator) on this machine. ' +
  'Restart AryaCode as Administrator, then retry. (Lease root: C:\\ProgramData\\agent-desktop\\<user-SID>\\.)';

function elevationNote(envelope) {
  const kind = envelope?.error?.details?.kind;
  return kind === 'lease_directory_untrusted' ? ELEVATION_HINT : '';
}

async function ensureSession() {
  if (state.sessionStarted) return undefined;
  const args = ['session', 'start'];
  if (effectiveOverlay()) args.push('--cursor');
  const envelope = parseEnvelope(await runCli(args));
  if (envelope.ok === true && typeof envelope.data?.session_id === 'string') {
    state.sessionId = envelope.data.session_id;
    state.sessionStarted = true;
    return envelope;
  }
  return envelope;
}

/* -------------------------------------------------------------- results */

function envelopeResult(envelope, extraText = '') {
  const note = elevationNote(envelope);
  const text = JSON.stringify(envelope) + extraText + note;
  return {
    content: [{ type: 'text', text }],
    structuredContent: envelope,
    isError: envelope.ok !== true,
  };
}

/* -------------------------------------------------------------- tools */

const str = { type: 'string' };
const bool = { type: 'boolean' };
const int = { type: 'integer' };

function tool(name, description, properties, required = []) {
  return {
    name,
    description,
    inputSchema: { type: 'object', properties, required },
  };
}

const TOOLS = [
  tool('snapshot',
    'Read a window as a semantic tree of refs (@sN:eN). Skeleton first for dense windows, then drill with root. Refs go stale after window changes — re-snapshot on STALE_REF. Chromium windows need timeout_ms 10000-25000 to settle.',
    { app: str, window_id: str, compact: bool, skeleton: bool, interactive_only: bool, max_depth: int, root: str, timeout_ms: int }),
  tool('find',
    'Search controls by name/role/text/value. Returns refs. Role must be as snapshot prints it (textfield, button, tabitem, listitem — not the native control type name). Use count for counts, first/limit to bound results.',
    { app: str, window_id: str, name: str, role: str, text: str, value: str, native_id: str, description: str, first: bool, last: bool, nth: int, limit: int, count: bool, exact: bool, root: str, timeout_ms: int }),
  tool('get', 'Read one control: property text|value|title|bounds|role|states.', { ref_id: str, property: str }),
  tool('is', 'Check one control: visible|enabled|checked|focused|expanded|selected.', { ref_id: str, property: str }),
  tool('click', 'Press a control with no pixels: the engine tries InvokePattern, then LegacyIAccessible. When both are refused the adapter retries the ref\u2019s own patterns (select/toggle/expand/collapse) and then posts a background WM_* click to the control window, so the user\u2019s pointer and foreground are untouched. Nothing physical runs unless physical:true. Verify by re-snapshot.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('focus', 'Focus a control through UIA SetFocus. On Windows SetFocus takes the desktop foreground window, so it is physical by nature and runs only with physical:true. For text entry prefer set_value, which focuses the field itself; to press a control use click.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('double_click', 'Double-click a control. Default is a background posted double-click (WM_LBUTTONDBLCLK) at the element centre: no pointer movement, no foreground change. Pass physical:true for a real mouse double-click. Verify by re-snapshot.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('right_click', 'Open a control\u2019s context menu. Default is a background posted right-click at the element centre: no pointer movement, no foreground change. Pass physical:true for a real mouse right-click. The menu is a separate surface: snapshot it after.', { ref_id: str, timeout_ms: int, physical: bool }),
  tool('expand', 'Expand an expander, tree item, or dropdown via ExpandCollapsePattern (no pixels).', { ref_id: str, timeout_ms: int }),
  tool('collapse', 'Collapse an expander or tree item via ExpandCollapsePattern (no pixels).', { ref_id: str, timeout_ms: int }),
  tool('toggle', 'Flip a checkbox or toggle button via TogglePattern. Prefer it over click: it reports the resulting state, and click on a checked control can be refused.', { ref_id: str, timeout_ms: int }),
  tool('set_value', 'Set a control value via UIA SetValue (no keystrokes, no pointer movement). This is the headless text path — use it first for any text entry. Some edits reject it — only then use type.', { ref_id: str, value: str, timeout_ms: int }),
  tool('select', 'Choose an option in a list, dropdown, tab strip or radio group through SelectionItemPattern (no pixels): pass the option text as value. This is the headless way to pick a choice without clicking it.', { ref_id: str, value: str, timeout_ms: int }, ['ref_id', 'value']),
  tool('check', 'Set a checkbox or switch to checked through TogglePattern. Idempotent and no pixels; prefer it over click when the state is known.', { ref_id: str, timeout_ms: int }),
  tool('uncheck', 'Set a checkbox or switch to unchecked through TogglePattern. Idempotent and no pixels.', { ref_id: str, timeout_ms: int }),
  tool('clear', 'Clear a control value to an empty string through UIA ValuePattern (no keystrokes, no pointer movement).', { ref_id: str, timeout_ms: int }),
  tool('scroll_to', 'Scroll an element into view through ScrollItemPattern (no pixels). Use it before acting on a row that is out of view.', { ref_id: str, timeout_ms: int }),
  tool('focus_window', 'Bring a window to the front. Takes the desktop foreground, so it runs only with physical:true. Usually unnecessary: a window behind another window stays readable and clickable in the background.', { window_id: str, app: str, title: str, physical: bool }),
  tool('type', 'Type real keystrokes into a text target. Keystroke synthesis is physical by nature: it needs the target window foreground and moves the pointer, so it runs only with physical:true. For text entry use set_value (headless UIA value write) or clear.', { ref_id: str, text: str, interval_ms: int, timeout_ms: int, physical: bool }),
  tool('press', 'Send a key chord (e.g. ctrl+s) to an app/window. Foreground queue: for non-frontmost apps expect delivered_unverified.', { combo: str, app: str, window_id: str, force: bool }),
  tool('scroll', 'Scroll a scrollable control: direction up|down|left|right, amount in lines.', { ref_id: str, direction: str, amount: int, timeout_ms: int }),
  tool('list_windows', 'List top-level windows (ids, titles, pids, responsiveness).', { app: str, timeout_ms: int }),
  tool('launch', 'Start an app. Bare names resolve only under System32; otherwise pass the absolute exe path. Ambiguous when many instances run — engine refuses to guess.', { app: str, args: { type: 'array', items: str }, cwd: str, activate: bool, timeout_ms: int }),
  tool('wait', 'Pause (ms) or wait for a condition: window/app/text/element before acting. Prevents acting on half-settled windows.', { ms: int, app: str, window: str, element: str, text: str, timeout_ms: int }),
  tool('screenshot', 'Capture a window/screen PNG to a file; returns the file path. Use for visual evidence only — trees are the primary signal.', { app: str, window_id: str, screen: int }),
  tool('ocr', 'Read text from a screenshot via Windows OCR (for canvas/games/no-a11y-tree UIs). Returns lines with SCREEN coordinates (not refs). query filters lines.', { app: str, window_id: str, screen: int, query: str }),
  tool('batch', `Run 1-${MAX_BATCH} planned actions on one target; stops on first error, then observes once. Each step: {action, arguments}. Native single-process actions (fast path): snapshot,find,get,is,set_value,press,scroll,scroll_to,select,check,uncheck,clear,expand,collapse,toggle,wait. click,type,focus,double_click,right_click,screenshot,ocr run step by step so each can pick its own delivery.`, { commands_json: str, stop_on_error: bool, timeout_ms: int }, ['commands_json']),
  tool('tools',
    'Manage the adapter: operation list|describe (tool surface + state), load {names} (reveal tools when the lazy preset is on), headed {on} (opts every physical path in this conversation in for five minutes; per-call physical:true is the narrower choice), overlay {on} (presentation cursor overlay), session_end {operation} (end this conversation\'s driver session).',
    { operation: str, name: str, names: { type: 'array', items: str }, on: bool }),
];

const TOOLS_BY_NAME = new Map(TOOLS.map((t) => [t.name, t]));

/* -------------------------------------------------------------- dispatch */

function flagArgs(pairs) {
  const argv = [];
  for (const [flag, value] of pairs) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean') {
      if (value) argv.push(flag);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length > 0) argv.push(flag, ...value.map(String));
      continue;
    }
    argv.push(flag, String(value));
  }
  return argv;
}

async function callTool(name, args = {}) {
  if (INPUT_TOOLS.has(name)) {
    const stopped = stoppedSeriesMessage();
    if (stopped) return stoppedResult(name, stopped);
  }
  switch (name) {
    case 'snapshot':
      return enqueue(async () => {
        await ensureSession();
        const envelope = parseEnvelope(await runCli(['snapshot', ...flagArgs([
          ['--app', args.app], ['--window-id', args.window_id], ['--compact', args.compact],
          ['--skeleton', args.skeleton], ['--interactive-only', args.interactive_only],
          ['--max-depth', args.max_depth], ['--root', args.root], ['--timeout-ms', args.timeout_ms],
        ])]));
        // The refs' advertised patterns are what a refused click retries under,
        // so the tree is indexed here rather than re-read per action.
        if (envelope.ok === true) indexSnapshot(envelope.data, args.window_id);
        return envelope;
      });
    case 'find':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['find', ...flagArgs([
          ['--app', args.app], ['--window-id', args.window_id], ['--name', args.name],
          ['--role', args.role], ['--text', args.text], ['--value', args.value],
          ['--native-id', args.native_id], ['--description', args.description],
          ['--first', args.first], ['--last', args.last], ['--nth', args.nth],
          ['--limit', args.limit], ['--count', args.count], ['--exact', args.exact],
          ['--root', args.root], ['--timeout-ms', args.timeout_ms],
        ])]));
      });
    case 'get':
      return enqueue(async () => parseEnvelope(await runCli(['get', args.ref_id, ...flagArgs([['--property', args.property]])])));
    case 'is':
      return enqueue(async () => parseEnvelope(await runCli(['is', args.ref_id, ...flagArgs([['--property', args.property]])])));
    case 'click':
      return enqueue(async () => {
        await ensureSession();
        // Ladder: semantic click -> the ref's own patterns -> a posted
        // background click. Physical input is reached only through consent.
        const primary = parseEnvelope(await runCli(['click', args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])]));
        if (primary.ok === true) return withMechanism(primary, 'semantic', [], 'Semantic delivery: the control ran its own pattern, so the pointer and the foreground were left alone.');
        const fallbackFrom = refusalSummary(primary);
        let physicalFailure = null;
        if (physicalAllowed(args)) {
          const physical = await physicalPointer('click', args.ref_id);
          if (physical?.ok === true) return physical;
          physicalFailure = physical?.error ?? null;
        }
        // A busy desktop interaction lease refuses every engine call the same way
        // (lock_timeout, e.g. while another launch is waiting for its window), so
        // in that case the background click is tried before alternatives that
        // cannot run. Nothing is skipped on any other refusal.
        const leaseHeld = fallbackFrom?.kind === 'lock_timeout' || leaseBusy(physicalFailure) !== null;
        let alternative = { envelope: null, attempted: [], mechanism: null };
        if (!leaseHeld) {
          alternative = await trySemanticAlternatives(args.ref_id, args.timeout_ms);
          if (alternative.envelope) {
            return withMechanism(alternative.envelope, alternative.mechanism, alternative.attempted, `The semantic click was refused (${primary.error?.code ?? 'failed'}); the same control answered ${alternative.mechanism} instead.`, fallbackFrom);
          }
        }
        const posted = await postedPointer('click', args.ref_id, 'click');
        if (posted.envelope) {
          if (fallbackFrom) posted.envelope.data.fallback_from = fallbackFrom;
          if (leaseHeld) {
            posted.envelope.data.note = 'The engine could not take the desktop interaction lease (another action holds it), so the click was posted to the control window instead: the user\'s mouse and foreground were left alone.';
          } else if (physicalFailure) {
            posted.envelope.data.physical_failed = { code: physicalFailure.code ?? null, kind: physicalFailure.details?.kind ?? null };
            posted.envelope.data.note = `The physical click you asked for did not run (${physicalFailure.code ?? 'failed'}), so the click was posted to the control window instead: the user's mouse and foreground were left alone.`;
          }
          return posted.envelope;
        }
        if (leaseHeld) {
          alternative = await trySemanticAlternatives(args.ref_id, args.timeout_ms);
          if (alternative.envelope) {
            return withMechanism(alternative.envelope, alternative.mechanism, alternative.attempted, `The semantic click was refused (${primary.error?.code ?? 'failed'}); the same control answered ${alternative.mechanism} instead.`, fallbackFrom);
          }
        }
        return annotateRefusal(primary, alternative.attempted, posted.reason);
      });
    case 'select':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['select', args.ref_id, String(args.value ?? ''), ...flagArgs([['--timeout-ms', args.timeout_ms]])]));
      });
    case 'expand':
    case 'collapse':
    case 'toggle':
    case 'check':
    case 'uncheck':
    case 'clear':
    case 'scroll_to':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli([NATIVE_BATCH_COMMANDS.get(name), args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])]));
      });
    case 'focus':
      return enqueue(async () => {
        await ensureSession();
        if (!physicalAllowed(args)) return physicalRefusal('focus', 'UIA SetFocus on Windows');
        const focused = withMechanism(
          parseEnvelope(await runCli(['focus', args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])], { headed: true })),
          'physical_synthetic',
          [],
          'Physical input: the target window took the desktop foreground.',
        );
        if (focused.ok !== true && leaseBusy(focused)) focused.hint = `${LEASE_BUSY_NOTE} The foreground was not changed.`;
        return focused;
      });
    case 'double_click':
    case 'right_click':
      return enqueue(async () => {
        await ensureSession();
        const nature = name === 'right_click' ? 'A right-click' : 'A double-click';
        const mode = name === 'right_click' ? 'right' : 'double';
        let physicalFailure = null;
        if (physicalAllowed(args)) {
          const physical = await physicalPointer(name, args.ref_id);
          if (physical?.ok === true) return physical;
          physicalFailure = physical?.error ?? null;
        }
        // The background click is the default delivery and also the safety net for
        // a consented physical click that could not run.
        const posted = await postedPointer(name, args.ref_id, mode);
        if (posted.envelope) {
          if (physicalFailure) {
            posted.envelope.data.physical_failed = { code: physicalFailure.code ?? null, kind: physicalFailure.details?.kind ?? null };
            posted.envelope.data.note = leaseBusy(physicalFailure)
              ? `${LEASE_BUSY_NOTE} The ${name === 'right_click' ? 'right-click' : 'double-click'} was posted to the control window instead, so the user's mouse and foreground were left alone.`
              : `The physical click you asked for did not run (${physicalFailure.code ?? 'failed'}), so the ${name === 'right_click' ? 'right-click' : 'double-click'} was posted to the control window instead.`;
          }
          return posted.envelope;
        }
        if (physicalFailure) {
          physicalFailure.hint = `Physical delivery did not run and a background posted click could not run either: ${posted.reason}.`;
          if (leaseBusy(physicalFailure)) physicalFailure.hint = `${LEASE_BUSY_NOTE} Retry in a moment.`;
          return physicalFailure;
        }
        const refused = physicalRefusal(name, nature);
        refused.hint = `A background posted click could not run either: ${posted.reason}.`;
        return refused;
      });
    case 'focus_window':
      return enqueue(async () => {
        if (!physicalAllowed(args)) return physicalRefusal('focus_window', 'Bringing a window to the front');
        const raised = withMechanism(
          parseEnvelope(await runCli(['focus-window', ...flagArgs([['--window-id', args.window_id], ['--app', args.app], ['--title', args.title]])], { headed: true })),
          'physical_synthetic',
          [],
          'Physical input: the desktop foreground changed.',
        );
        if (raised.ok !== true && leaseBusy(raised)) raised.hint = `${LEASE_BUSY_NOTE} The foreground was not changed.`;
        return raised;
      });
    case 'set_value':
      return enqueue(async () => parseEnvelope(await runCli(['set-value', args.ref_id, String(args.value ?? ''), ...flagArgs([['--timeout-ms', args.timeout_ms]])])));
    case 'type':
      return enqueue(async () => {
        await ensureSession();
        // Engine fact on Windows: headless `type` is POLICY_DENIED — keystroke
        // synthesis is headed-only and needs the window frontmost. It therefore
        // runs only when the user's consent is in hand (physical), and never
        // promotes the window on its own.
        const text = String(args.text ?? '');
        if (!text) {
          return { version: '2.6', ok: false, command: 'type', error: { code: 'INVALID_ARGS', message: 'type needs text', disposition: { delivery: 'not_delivered', retry: 'safe' } } };
        }
        if (!physicalAllowed(args)) return physicalRefusal('type', 'Keystroke synthesis');
        const promote = await promoteForPhysical(args.ref_id);
        if (promote) {
          promote.hint = leaseBusy(promote)
            ? `${LEASE_BUSY_NOTE} Nothing was typed. Retry in a moment, or use set_value (headless UIA write), which never needs the lease-free foreground path.`
            : 'The target window could not be brought to the foreground, so physical typing would land in whatever window the user has in front. Use set_value (headless UIA write) or clear instead.';
          return promote;
        }
        const envelope = parseEnvelope(await runCli(['type', args.ref_id, text, ...flagArgs([['--interval-ms', args.interval_ms], ['--timeout-ms', args.timeout_ms]])], { headed: true }));
        if (envelope.ok !== true) envelope.hint = 'Keystroke synthesis is physical: it moves the pointer and focuses the window. Prefer set_value, which writes through the UIA value pattern headless.';
        return envelope;
      });
    case 'press':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli(['press', args.combo, ...flagArgs([['--app', args.app], ['--window-id', args.window_id], ['--force', args.force]])]));
      });
    case 'scroll':
      return enqueue(async () => parseEnvelope(await runCli(['scroll', args.ref_id, ...flagArgs([['--direction', args.direction], ['--amount', args.amount], ['--timeout-ms', args.timeout_ms]])])));
    case 'list_windows':
      return enqueue(async () => parseEnvelope(await runCli(['list-windows', ...flagArgs([['--app', args.app], ['--timeout-ms', args.timeout_ms]])])));
    case 'launch': {
      // Engine contract: `--arg <ARGS>` is repeatable and takes `--arg=<value>`
      // when the value starts with `-`; the timeout flag is `--timeout`. The old
      // `--args`/`--timeout-ms` pair was refused with INVALID_ARGS.
      const argv = ['launch', String(args.app ?? ''), ...flagArgs([['--cwd', args.cwd], ['--activate', args.activate], ['--timeout', args.timeout_ms]])];
      const extra = Array.isArray(args.args) ? args.args : args.args === undefined || args.args === null ? [] : [args.args];
      for (const value of extra) {
        const text = String(value);
        if (text.startsWith('-')) argv.push(`--arg=${text}`);
        else argv.push('--arg', text);
      }
      return enqueue(async () => parseEnvelope(await runCli(argv)));
    }
    case 'wait':
      return enqueue(async () => parseEnvelope(await runCli(['wait', ...(args.ms === undefined || args.ms === null ? [] : [String(args.ms)]), ...flagArgs([['--app', args.app], ['--window', args.window], ['--element', args.element], ['--text', args.text], ['--timeout', args.timeout_ms]])])));
    case 'screenshot':
      return enqueue(async () => {
        await ensureSession();
        const file = join(SHOTS_DIR, `shot-${Date.now()}.png`);
        const envelope = parseEnvelope(await runCli(['screenshot', file, ...flagArgs([['--app', args.app], ['--window-id', args.window_id], ['--screen', args.screen]])]));
        return envelopeResult(envelope, envelope.ok ? ` File: ${file}` : '');
      });
    case 'ocr':
      return enqueue(async () => runOcr(args));
    case 'batch': {
      let commands;
      try {
        commands = JSON.parse(args.commands_json);
      } catch {
        return { content: [{ type: 'text', text: 'commands_json is not valid JSON: expected an array of {action, arguments} steps.' }], isError: true };
      }
      if (!Array.isArray(commands) || commands.length < 1 || commands.length > MAX_BATCH) {
        return { content: [{ type: 'text', text: `batch needs 1-${MAX_BATCH} steps (got ${Array.isArray(commands) ? commands.length : 'non-array'}).` }], isError: true };
      }
      const actions = commands.map((step) => String(step?.action || ''));
      const unknown = actions.filter((action) => !NATIVE_BATCH_COMMANDS.has(action) && !LOOP_BATCH_ACTIONS.has(action));
      if (unknown.length > 0) {
        return { content: [{ type: 'text', text: JSON.stringify({ ok: false, unknown, supported: [...NATIVE_BATCH_COMMANDS.keys(), ...LOOP_BATCH_ACTIONS] }) }], isError: true };
      }
      if (!actions.some((action) => LOOP_BATCH_ACTIONS.has(action))) {
        // One engine process for the whole batch. Every CLI call costs ~85 ms of
        // spawn plus UIA cold start, and the engine runs the same policy checks and
        // dispatch per entry, so this is ~1.7x faster than the loop and keeps each
        // entry's payload — a find step yields refs instead of "ok".
        const entries = commands.map((step) => {
          const action = String(step?.action || '');
          return { command: NATIVE_BATCH_COMMANDS.get(action), args: batchEntryArgs(action, step?.arguments || {}) };
        });
        return enqueue(async () => {
          await ensureSession();
          const cli = ['batch', JSON.stringify(entries)];
          if (args.stop_on_error !== false) cli.push('--stop-on-error');
          if (args.timeout_ms !== undefined && args.timeout_ms !== null) cli.push('--timeout-ms', String(args.timeout_ms));
          const envelope = parseEnvelope(await runCli(cli));
          if (envelope.ok === true) envelope.data = trimBatchData(envelope.data);
          return envelopeResult(envelope);
        });
      }
      // click picks its own delivery rung per target, type needs consent, and
      // screenshot/ocr own an adapter-side file path, so a batch containing any of
      // them runs step by step.
      const results = [];
      for (const step of commands) {
        const action = String(step?.action || '');
        const out = await callTool(action, step?.arguments || {});
        const envelope = out.structuredContent ?? out;
        results.push({ action, ok: envelope.ok === true, summary: summarizeEnvelope(envelope) });
        if (envelope.ok !== true && args.stop_on_error !== false) break;
      }
      return { content: [{ type: 'text', text: JSON.stringify({ ok: results.every((r) => r.ok), results }) }], isError: !results.every((r) => r.ok) };
    }
    case 'tools':
      return enqueue(async () => {
        const op = args.operation || 'list';
        if (op === 'describe') {
          const t = TOOLS_BY_NAME.get(args.name);
          return { content: [{ type: 'text', text: t ? JSON.stringify(t) : `unknown tool: ${args.name}` }], isError: !t };
        }
        if (op === 'headed') {
          state.headedOverride = args.on === true;
          state.headedExpiresAt = args.on === true ? Date.now() + HEADED_LEASE_MS : 0;
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, headed: effectiveHeaded(), headedDefault: state.headedDefault, lease_ms: args.on === true ? HEADED_LEASE_MS : 0, note: 'Headed drives the real mouse and keyboard for every action in this conversation. It releases on session_end and expires on its own. Prefer set_value for text so headed is not needed at all.' }) }] };
        }
        if (op === 'overlay') {
          state.overlayOverride = args.on === true;
          if (state.sessionStarted) {
            const env = parseEnvelope(await runCli(['cursor-overlay', state.overlayOverride ? 'enable' : 'disable']));
            return { content: [{ type: 'text', text: JSON.stringify({ ok: env.ok === true, overlay: effectiveOverlay(), engine: env }) }] };
          }
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, overlay: effectiveOverlay(), note: 'applies at next session start' }) }] };
        }
        if (op === 'load') {
          // Lazy preset only: reveal tools on demand. `names` may name several
          // tools ('all' or no names reveals every remaining tool).
          const requested = Array.isArray(args.names)
            ? args.names
            : typeof args.names === 'string' && args.names.trim()
              ? args.names.split(/[,\s]+/).filter(Boolean)
              : [];
          const unknown = requested.filter((name) => !TOOLS_BY_NAME.has(name));
          if (unknown.length > 0) {
            return { content: [{ type: 'text', text: JSON.stringify({ ok: false, unknown, hint: 'see tools {operation:"describe"} or the tool list' }) }], isError: true };
          }
          const before = exposedTools().length;
          const revealAll = requested.length === 0 || requested.includes('all');
          for (const tool of TOOLS) {
            if (revealAll || requested.includes(tool.name)) state.extraTools.add(tool.name);
          }
          const after = exposedTools().length;
          if (after !== before) notifyToolsChanged();
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                ok: true,
                preset: state.toolPreset,
                revealed: after - before,
                tools: exposedTools().map((tool) => tool.name),
              }),
            }],
          };
        }
        if (op === 'session_end') {
          const env = parseEnvelope(await runCli(['session', 'end']));
          await runCli(['session', 'gc']);
          state.sessionStarted = false;
          state.sessionId = `arya-${randomBytes(4).toString('hex')}`;
          // Ending the driver session also releases the physical-input latch.
          state.headedOverride = null;
          state.headedExpiresAt = 0;
          return { content: [{ type: 'text', text: JSON.stringify({ ok: env.ok === true, note: 'new session starts on next action', engine: env }) }] };
        }
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              tools: exposedTools().map((t) => t.name),
              preset: state.toolPreset,
              hidden: state.toolPreset === 'lazy' ? TOOLS.length - exposedTools().length : 0,
              state: { session: state.sessionId, sessionStarted: state.sessionStarted, headed: effectiveHeaded(), headedDefault: state.headedDefault, overlay: effectiveOverlay(), overlayDefault: state.overlayDefault },
              engine_state_root: ENGINE_STATE_ROOT,
            }),
          }],
        };
      });
    default:
      return { content: [{ type: 'text', text: `unknown tool: ${name}` }], isError: true };
  }
}

function summarizeEnvelope(envelope) {
  if (envelope?.ok === true) {
    const d = envelope.data ?? {};
    const bits = [];
    if (d.ref_count !== undefined) bits.push(`refs ${d.ref_count}`);
    // A step that locates something is useless without the ref it found, and a
    // read step without its value is the same. Report the payload, not just "ok".
    if (d.match?.ref_id) bits.push(`ref ${d.match.ref_id}${d.match.name ? ` (${d.match.name})` : ''}`);
    if (Array.isArray(d.matches) && d.matches.length) bits.push(`refs ${d.matches.slice(0, 8).map((m) => m.ref_id).join(',')}`);
    if (d.snapshot_id) bits.push(`snapshot ${d.snapshot_id}`);
    if (d.value !== undefined) bits.push(`value ${JSON.stringify(d.value)}`);
    if (d.result !== undefined) bits.push(`result ${JSON.stringify(d.result)}`);
    if (d.window?.id) bits.push(`window ${d.window.id}`);
    if (d.target?.process?.pid) bits.push(`pid ${d.target.process.pid}`);
    if (d.disposition?.delivery) bits.push(`delivery ${d.disposition.delivery}`);
    return bits.join('; ') || 'ok';
  }
  return `${envelope?.error?.code || 'ERROR'}: ${String(envelope?.error?.message || '').slice(0, 200)}`;
}

async function runOcr(args) {
  const file = join(SHOTS_DIR, `ocr-${Date.now()}.png`);
  const shot = parseEnvelope(await runCli(['screenshot', file, ...flagArgs([['--app', args.app], ['--window-id', args.window_id], ['--screen', args.screen]])]));
  if (shot.ok !== true) return envelopeResult(shot);
  const ps = await new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', OCR_PS1, '-ImagePath', file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const start = ps.stdout.indexOf('{');
  const end = ps.stdout.lastIndexOf('}');
  if (start === -1 || end <= start) {
    return {
      content: [{ type: 'text', text: JSON.stringify({ ok: false, error: `ocr.ps1 exited ${ps.code}`, stderr: ps.stderr.slice(0, 400), screenshot: file }) }],
      isError: true,
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(ps.stdout.slice(start, end + 1));
  } catch {
    return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'ocr.ps1 output not JSON', screenshot: file }) }], isError: true };
  }
  if (args.query && Array.isArray(parsed.lines)) {
    const needle = String(args.query).toLowerCase();
    parsed.lines = parsed.lines.filter((l) => String(l.text || '').toLowerCase().includes(needle));
    parsed.query = args.query;
  }
  parsed.screenshot = file;
  return { content: [{ type: 'text', text: JSON.stringify(parsed) }], isError: parsed.ok !== true };
}

/* -------------------------------------------------------------- protocol */

const INSTRUCTIONS = [
  'Arya Computer Use: drive Windows apps through semantic UIA refs, not pixels.',
  'Loop: snapshot (skeleton/compact first) -> act on @refs -> re-snapshot to verify.',
  'Refs go stale after window changes: on STALE_REF/AMBIGUOUS_TARGET, re-snapshot.',
  'Nothing you do moves the user\'s pointer or takes their foreground unless you pass physical:true or arm tools {operation:"headed"}. Read and act while they keep working.',
  'click never falls back to a physical click on its own: it tries the control\'s own patterns, then a posted background click (no cursor movement, no foreground change). The result names the mechanism in data.mechanism and pointer.',
  'Prefer the exact semantic tool when the control advertises it: select (options/tabs/list items), check/uncheck (checkboxes, switches), toggle, expand/collapse, clear, scroll_to. These are idempotent and never touch the pointer.',
  'set_value is the headless text path (UIA value pattern, pointer stays put). type needs physical:true: keystrokes are synthesized and the target window takes the foreground.',
  'double_click and right_click arrive as posted background messages by default; pass physical:true only when the app ignores posted input.',
  'focus and focus_window are physical by nature (they change the desktop foreground), so they need physical:true. Do not raise a window to click it: refs work on background windows. A minimized window must be restored first.',
  'tools {operation:"headed",on:true} arms every physical path in this conversation for five minutes; per-call physical:true is the narrower choice. session_end clears it.',
  'Chromium windows settle slowly: snapshot with timeout_ms 10000-25000.',
  'Verify stateful actions by re-read; delivered_verified = confirmed, delivered_unverified retry:unsafe = do not blind-repeat.',
  'On ACTION_FAILED post_action_verification the action landed: read data.post_state, do NOT retry.',
  'This host must run elevated (Administrator); lease_directory_untrusted means restart AryaCode as Administrator.',
  'Esc (or the stop shortcut) stops the series: input tools then return COMPUTER_USE_STOPPED_BY_USER for this turn. Reads still work; do not retry input until a new user turn.',
  'Destructive actions (delete, send, pay, close unsaved) require user confirmation first.',
  'No accessibility tree (games/canvas): use ocr for text and physical:true for coordinate input.',
].join('\n');

const server = { name: 'arya_desktop', version: VERSION };

function send(msg) {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

function reply(id, result) {
  send({ jsonrpc: '2.0', id, result });
}

function replyError(id, code, message) {
  send({ jsonrpc: '2.0', id, error: { code, message } });
}

const rl = createInterface({ input: process.stdin, terminal: false });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    reply(id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: true } },
      serverInfo: server,
      instructions: INSTRUCTIONS,
    });
    return;
  }
  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) return;
  if (method === 'ping') {
    reply(id, {});
    return;
  }
  if (method === 'tools/list') {
    reply(id, { tools: exposedTools() });
    return;
  }
  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    Promise.resolve()
      .then(() => callTool(name, args))
      .then(async (out) => {
        try { await noteTarget(name, args, out); } catch { /* overlay hint only */ }
        return out;
      })
      .then((out) => reply(id, Array.isArray(out?.content) ? out : envelopeResult(out)))
      .catch((error) => reply(id, { content: [{ type: 'text', text: `adapter error: ${error?.message || error}` }], isError: true }));
    return;
  }
  if (id !== undefined) replyError(id, -32601, `method not supported: ${method}`);
});
process.stdin.on('end', () => process.exit(0));
