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
  ['click', 'click'], ['set_value', 'set-value'], ['press', 'press'],
  ['scroll', 'scroll'], ['wait', 'wait'], ['focus', 'focus'],
  ['double_click', 'double-click'], ['right_click', 'right-click'],
  ['expand', 'expand'], ['collapse', 'collapse'], ['toggle', 'toggle'],
]);
// The engine's --headed is global and applies to every batch entry, so a step
// that needs physical input cannot share one native batch with semantic steps:
// those run through the adapter one at a time, each with its own scoped flag.
const LOOP_BATCH_ACTIONS = new Set(['type', 'screenshot', 'ocr', 'focus', 'double_click', 'right_click']);
const BATCH_ARG_KEYS = {
  snapshot: ['app', 'window_id', 'compact', 'skeleton', 'interactive_only', 'max_depth', 'root', 'timeout_ms'],
  find: ['app', 'window_id', 'name', 'role', 'text', 'value', 'native_id', 'description', 'first', 'last', 'nth', 'limit', 'count', 'exact', 'root', 'timeout_ms'],
  get: ['ref_id', 'property'],
  is: ['ref_id', 'property'],
  click: ['ref_id', 'timeout_ms'],
  focus: ['ref_id', 'timeout_ms'],
  double_click: ['ref_id', 'timeout_ms'],
  right_click: ['ref_id', 'timeout_ms'],
  expand: ['ref_id', 'timeout_ms'],
  collapse: ['ref_id', 'timeout_ms'],
  toggle: ['ref_id', 'timeout_ms'],
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

function runCli(args, { headed = effectiveHeaded() } = {}) {
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
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (error) => resolve({ code: -1, stdout: '', stderr: String(error?.message || error) }));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
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

// Headed delivery requires the target window frontmost. A background CLI
// process cannot SetForegroundWindow (Windows foreground lock), and the
// engine's focus/focus-window fail with ACTION_FAILED foreground. A physical
// click at the target's center promotes it to frontmost (OS click handling),
// then headed delivery succeeds. Returns the failing envelope, or null when
// the target is frontmost (or the click landed and we proceed optimistically).
async function ensureForeground(refId) {
  const focused = parseEnvelope(await runCli(['is', refId, '--property', 'focused']));
  if (focused.ok === true && focused.data?.value === true) return null;
  const bounds = parseEnvelope(await runCli(['get', refId, '--property', 'bounds']));
  if (bounds.ok !== true) return bounds;
  const b = bounds.data?.value ?? {};
  const x = Math.round((b.x ?? 0) + (b.width ?? 0) / 2);
  const y = Math.round((b.y ?? 0) + (b.height ?? 0) / 2);
  const click = parseEnvelope(await runCli(['mouse-click', '--xy', `${x},${y}`], { headed: true }));
  if (click.ok !== true) return click;
  return null;
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
  tool('click', 'Press a control via its semantic action (no pixels). Verify by re-snapshot.', { ref_id: str, timeout_ms: int }),
  tool('focus', 'Focus a control through UIA SetFocus. On Windows SetFocus takes the desktop foreground window, so the engine refuses it headless: the adapter runs it as physical input for this one call (same rule as type) without latching the conversation. For text entry prefer set_value, which focuses the field itself.', { ref_id: str, timeout_ms: int }),
  tool('double_click', 'Double-click a control. Windows has no headless double-click, so this drives the real pointer for this one call (same rule as type). Verify by re-snapshot.', { ref_id: str, timeout_ms: int }),
  tool('right_click', 'Open a control\u2019s context menu. Windows has no headless right-click, so this drives the real pointer for this one call (same rule as type). The menu is a separate surface: snapshot it after.', { ref_id: str, timeout_ms: int }),
  tool('expand', 'Expand an expander, tree item, or dropdown via ExpandCollapsePattern (no pixels).', { ref_id: str, timeout_ms: int }),
  tool('collapse', 'Collapse an expander or tree item via ExpandCollapsePattern (no pixels).', { ref_id: str, timeout_ms: int }),
  tool('toggle', 'Flip a checkbox or toggle button via TogglePattern. Prefer it over click: it reports the resulting state, and click on a checked control can be refused.', { ref_id: str, timeout_ms: int }),
  tool('set_value', 'Set a control value via UIA SetValue (no keystrokes, no pointer movement). This is the headless text path — use it first for any text entry. Some edits reject it — only then use type.', { ref_id: str, value: str, timeout_ms: int }),
  tool('type', 'Type real keystrokes into a text target. On Windows keystroke synthesis is physical: this moves the pointer and briefly focuses the window. Prefer set_value (headless UIA write) for text entry.', { ref_id: str, text: str, interval_ms: int, timeout_ms: int }),
  tool('press', 'Send a key chord (e.g. ctrl+s) to an app/window. Foreground queue: for non-frontmost apps expect delivered_unverified.', { combo: str, app: str, window_id: str, force: bool }),
  tool('scroll', 'Scroll a scrollable control: direction up|down|left|right, amount in lines.', { ref_id: str, direction: str, amount: int, timeout_ms: int }),
  tool('list_windows', 'List top-level windows (ids, titles, pids, responsiveness).', { app: str, timeout_ms: int }),
  tool('launch', 'Start an app. Bare names resolve only under System32; otherwise pass the absolute exe path. Ambiguous when many instances run — engine refuses to guess.', { app: str, args: { type: 'array', items: str }, cwd: str, activate: bool, timeout_ms: int }),
  tool('wait', 'Pause (ms) or wait for a condition: window/app/text/element before acting. Prevents acting on half-settled windows.', { ms: int, app: str, window: str, element: str, text: str, timeout_ms: int }),
  tool('screenshot', 'Capture a window/screen PNG to a file; returns the file path. Use for visual evidence only — trees are the primary signal.', { app: str, window_id: str, screen: int }),
  tool('ocr', 'Read text from a screenshot via Windows OCR (for canvas/games/no-a11y-tree UIs). Returns lines with SCREEN coordinates (not refs). query filters lines.', { app: str, window_id: str, screen: int, query: str }),
  tool('batch', `Run 1-${MAX_BATCH} planned actions on one target; stops on first error, then observes once. Each step: {action, arguments}. Native single-process actions (fast path): snapshot,find,get,is,click,set_value,press,scroll,wait,focus,double_click,right_click,expand,collapse,toggle. type,screenshot,ocr run step by step.`, { commands_json: str, stop_on_error: bool, timeout_ms: int }, ['commands_json']),
  tool('tools',
    'Manage the adapter: operation list|describe (tool surface + state), load {names} (reveal tools when the lazy preset is on), headed {on} (per-conversation headed toggle — use when headless is not an option: cursor-moving input, notifications, shell surfaces), overlay {on} (presentation cursor overlay), session_end {operation} (end this conversation\'s driver session).',
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
        return parseEnvelope(await runCli(['snapshot', ...flagArgs([
          ['--app', args.app], ['--window-id', args.window_id], ['--compact', args.compact],
          ['--skeleton', args.skeleton], ['--interactive-only', args.interactive_only],
          ['--max-depth', args.max_depth], ['--root', args.root], ['--timeout-ms', args.timeout_ms],
        ])]));
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
        return parseEnvelope(await runCli(['click', args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])]));
      });
    case 'expand':
    case 'collapse':
    case 'toggle':
      return enqueue(async () => {
        await ensureSession();
        return parseEnvelope(await runCli([NATIVE_BATCH_COMMANDS.get(name), args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])]));
      });
    case 'focus':
    case 'double_click':
    case 'right_click':
      return enqueue(async () => {
        await ensureSession();
        // Engine fact on Windows (platform skill): right-click, double-click and
        // focus are physical or take the desktop foreground, so they return
        // POLICY_DENIED headless. --headed is scoped to THIS call, exactly like
        // `type`; the conversation is never latched into physical input.
        return parseEnvelope(await runCli([NATIVE_BATCH_COMMANDS.get(name), args.ref_id, ...flagArgs([['--timeout-ms', args.timeout_ms]])], { headed: true }));
      });
    case 'set_value':
      return enqueue(async () => parseEnvelope(await runCli(['set-value', args.ref_id, String(args.value ?? ''), ...flagArgs([['--timeout-ms', args.timeout_ms]])])));
    case 'type':
      return enqueue(async () => {
        await ensureSession();
        // Engine fact on Windows: headless `type` is POLICY_DENIED — keystroke
        // synthesis is headed-only. `type` is therefore physical by nature, so
        // --headed is scoped to THIS call and the conversation is never latched
        // into it. Latching was what made every later click/scroll move the
        // user's real pointer.
        const promote = await ensureForeground(args.ref_id);
        if (promote) return envelopeResult(promote);
        const env = parseEnvelope(await runCli(['type', args.ref_id, args.text ?? '', ...flagArgs([['--interval-ms', args.interval_ms], ['--timeout-ms', args.timeout_ms]])], { headed: true }));
        if (env && env.ok !== true) env.hint = 'Keystroke synthesis is physical: it moves the pointer and focuses the window. Prefer set_value, which writes through the UIA value pattern headless.';
        return env;
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
    case 'launch':
      return enqueue(async () => parseEnvelope(await runCli(['launch', args.app, ...flagArgs([['--args', args.args], ['--cwd', args.cwd], ['--activate', args.activate], ['--timeout-ms', args.timeout_ms]])])));
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
      // type promotes the window to the foreground first, and screenshot/ocr own an
      // adapter-side file path, so a batch containing them runs step by step.
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
  'set_value is the headless text path (UIA value pattern, pointer stays put). type synthesizes real keystrokes: it moves the pointer and focuses the window, scoped to that one call.',
  'Headed mode (tools {operation:"headed",on:true}) makes EVERY action in this conversation physical input. Use it only when background input is refused; it releases on session_end and expires after 5 minutes.',
  'Chromium windows settle slowly: snapshot with timeout_ms 10000-25000.',
  'Verify stateful actions by re-read; delivered_verified = confirmed, delivered_unverified retry:unsafe = do not blind-repeat.',
  'On ACTION_FAILED post_action_verification the action landed: read data.post_state, do NOT retry.',
  'This host must run elevated (Administrator); lease_directory_untrusted means restart AryaCode as Administrator.',
  'Esc (or the stop shortcut) stops the series: input tools then return COMPUTER_USE_STOPPED_BY_USER for this turn. Reads still work; do not retry input until a new user turn.',
  'Destructive actions (delete, send, pay, close unsaved) require user confirmation first.',
  'No accessibility tree (games/canvas): use ocr for text and headed mouse coordinates for input.',
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
